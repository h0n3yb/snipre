from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import json
import os
import requests
from typing import Optional
import asyncio
import aiohttp
from concurrent.futures import ProcessPoolExecutor
import uvicorn
import logging
import argparse
from lib.HomeHarvest import scrape_property
from datetime import datetime
import math
from dotenv import load_dotenv

load_dotenv()

parser = argparse.ArgumentParser(description="PropRun service")
parser.add_argument("-v", "--verbose", action="store_true", help="Enable INFO output")
parser.add_argument("-vv", "--debug", action="store_true", help="Enable DEBUG output")
parser.add_argument("-t", "--test", action="store_true", help="Test mode: use our test CSV where we know first 500 listings are cached")
parser.add_argument("-c", "--cache-only", action="store_true", help="Don't ping the API for new rental values, only use our cache")
#parser.add_argument("-l", "--location", required=True, help="Location to search and scrape, format: \"Austin, TX\"")
args = parser.parse_args()

# Set up logging
if args.verbose:
    logging.basicConfig(level=logging.INFO)
elif args.debug:
    logging.basicConfig(level=logging.DEBUG)

logger = logging.getLogger(__name__)

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic model for request payload
class ListingOptions(BaseModel):
    location: str = None
    num_listings: Optional[int] = None
    profit: float = 500
    down_payment: float = 20
    interest_rate: float = 7.0
    loan_term_years: int = 30
    zip_code: Optional[int] = None

# Constants
CACHE_FILE = 'rentcast_cache.json'
API_KEY = os.getenv('API_KEY')

def pull_re_data(location, fmt_loc):
    logging.info("Updating listings data...")
    today = datetime.now().date()
    filename = f"HomeHarvest_{today}_{fmt_loc}.csv"

    logging.info(f"Scraping listings in {fmt_loc}")

    properties = scrape_property(
        location=location,
        listing_type="for_sale",
        past_days=30,
    )
    
    logging.info(f"Number of properties: {len(properties)}")
    logging.info(f"Writing data to CSV: {filename}")
    
    properties.to_csv(filename, index=False)

    return filename

def check_re_data(file_path, location, fmt_loc):
    if os.path.isfile(file_path):
        logging.info(f"Checking {file_path}")
        file_name = os.path.basename(file_path)
        file_date_str = file_name.split('_')[1].split('.')[0]
        file_date = datetime.strptime(file_date_str, '%Y-%m-%d').date()
        today_date = datetime.now().date()

        if file_date != today_date:
            logging.info("Listings data is outdated...")
            return pull_re_data(location, fmt_loc)
        else:
            logging.info("Listings data is up-to-date!")
            return file_path
    else:
        return pull_re_data(location, fmt_loc)

def calculate_mortgage(list_price, down_payment_percentage, interest_rate, loan_term_years):
    down_payment = list_price * (down_payment_percentage / 100)
    loan_amount = list_price - down_payment
    monthly_interest_rate = (interest_rate / 100) / 12
    num_payments = loan_term_years * 12
    monthly_payment = (loan_amount * monthly_interest_rate * (1 + monthly_interest_rate)**num_payments) / ((1 + monthly_interest_rate)**num_payments - 1)
    return monthly_payment

async def fetch_rentcast_property_details(property_id, API_KEY):
    
    logging.debug(f"Fetching details for: {property_id}")
    
    url = 'https://api.rentcast.io/v1/avm/rent/long-term'
    
    params = {
        'address': address,
        'propertyType': property_type,
        'bedrooms': bedrooms,
        'bathrooms': bathrooms,
        'squareFootage': square_footage
    }
    headers = {
        'accept': 'application/json',
        'X-Api-Key': api_key
    }
    
    logging.debug(f"Request URL: {url}")
    logging.debug(f"Request parameters: {params}")
    logging.debug(f"Request headers: {headers}")
    
    async with session.get(url, params=params, headers=headers) as response:
        logging.debug(f"Response status: {response.status}")
        if response.status == 200:
            data = await response.json()
            logging.debug(f"Response data: {data}")
            return data
        else:
            logging.debug(f"Failed to fetch rent estimate, status code: {response.status}")
            return None 

async def fetch_rentcast_estimate(session, address, property_type, bedrooms, bathrooms, square_footage, api_key):
    logging.debug(f"Fetching rent estimate for address: {address}, property type: {property_type}, bedrooms: {bedrooms}, bathrooms: {bathrooms}, square footage: {square_footage}")
    
    url = 'https://api.rentcast.io/v1/avm/rent/long-term'
    params = {
        'address': address,
        'propertyType': property_type,
        'bedrooms': bedrooms,
        'bathrooms': bathrooms,
        'squareFootage': square_footage
    }
    headers = {
        'accept': 'application/json',
        'X-Api-Key': api_key
    }
    
    logging.debug(f"Request URL: {url}")
    logging.debug(f"Request parameters: {params}")
    logging.debug(f"Request headers: {headers}")
    
    async with session.get(url, params=params, headers=headers) as response:
        logging.debug(f"Response status: {response.status}")
        if response.status == 200:
            data = await response.json()
            logging.debug(f"Response data: {data}")
            return data
        else:
            logging.debug(f"Failed to fetch rent estimate, status code: {response.status}")
            return None

def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_cache(cache):
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f, indent=4)

async def process_listing(row, options, cache, cache_only, session):
    
    address = f"{row['full_street_line']}, {row['city']}, {row['state']} {row['zip_code']}"
    
    logger.info(f"================= Processing: {address} =================")
    
    if address in cache:
        rental_data = cache[address]
        logger.info(f"Found cached entry: {address}")
    else:
        if cache_only:
            logger.info(f"Cache only mode: skipping non-cached listing: {address}")
            return None
        
        logger.info(f"New: {address} -- calling API for rental estimate")
        
        if math.isnan(row['half_baths']):
            bathrooms = row['full_baths']
        else:
            bathrooms = row['full_baths'] + row['half_baths']
            logging.debug(bathrooms)

        sqft = row['sqft']
        if math.isnan(sqft):
            logging.debug(f"Missing sqft data for {address}, defaulting to 1000")
            sqft = 1000

        nans = row[row.isna()].index.tolist()
        
        logging.debug(f"\n\n########################## Missing data for {address}: {nans}\n\n")

        if "beds" in nans or "full_baths" in nans:
            logging.debug(f"Critical amount of missing data for {address}, skipping...")
            return None

        rental_data = await fetch_rentcast_estimate(
            session,
            address,
            row['style'],
            row['beds'],
            bathrooms,
            sqft,
            API_KEY,
        )
        if rental_data:
            cache[address] = rental_data
            logger.info(f"Cached rental estimate for: {address}")


    if rental_data:
        try:
            rentcast_rent = rental_data['rent']
            rentcast_rent_low = rental_data['rentRangeLow']
            rentcast_rent_high = rental_data['rentRangeHigh']

            total_operating_cost = round(row['monthly_mortgage'] + row["home_insurance"] + row["property_tax"], 2)
            differential = rentcast_rent - row['ideal_rental_price']
            adjusted_profit = round((max(0, options.profit + differential)), 2) if differential < 0 else None

            rental_obj = {
                "address": address,
                "list_price": round(row['list_price'], 2),
                "mortgage": round(row['monthly_mortgage'], 2),
                "home_insurance": round(row["home_insurance"], 2),
                "property_tax": round(row["property_tax"], 2),
                "total_operating_cost": total_operating_cost,
                "target_net_margin": round(row['ideal_rental_price'] - row['monthly_mortgage'], 2),
                "rental_price": round(row['ideal_rental_price'], 2),
                "rental_value": round(rentcast_rent, 2),
                "differential": round(differential, 2),
                "is_profitable": differential >= 0,
                "adjusted_profit": adjusted_profit,
                "rentcast_rent_low": round(rentcast_rent_low, 2),
                "rentcast_rent_high": round(rentcast_rent_high, 2)
            }

            if math.isnan(rental_obj["total_operating_cost"]):
                logging.debug(f"Skipping: {address} -- Found NaN in JSON: {json.dumps(rental_obj)}")
                return None

            logging.debug(f"Building rental data object for: {address} -- JSON: {json.dumps(rental_obj)}")
            return rental_obj
        except (KeyError, IndexError) as e:
            return None
    else:
        logging.info(f"Error while building rental object for {address}")
    return None

@app.post("/process_listings")
async def process_listings(options: ListingOptions):
    
    cache = load_cache()
    location = options.location
    fmt_loc = location.replace(", ", "_")
    CSV_FILE_PATH = f'HomeHarvest_{datetime.now().date()}_{fmt_loc}.csv'
    
    try:
        if not args.test:
            logging.debug(f"Checking: {fmt_loc}")
            data = check_re_data(CSV_FILE_PATH, location, fmt_loc)
            logging.info(f"Loading data: {data}")
            listings_df = pd.read_csv(data)
        else:
            logging.info("Loading test data...")
            listings_df = pd.read_csv("HomeHarvest_2024-big.csv")

    except Exception as e:
        logging.info(e)
        raise HTTPException(status_code=500, detail="Error loading CSV file")

    if options.num_listings:
        listings_df = listings_df.head(options.num_listings)
    if options.zip_code:
        listings_df = listings_df[listings_df['zip_code'] == options.zip_code]

    listings_df['list_price'] = listings_df['list_price'].astype(float)
    listings_df['monthly_mortgage'] = listings_df['list_price'].apply(lambda x: calculate_mortgage(x, options.down_payment, options.interest_rate, options.loan_term_years))
    listings_df['ideal_rental_price'] = listings_df['monthly_mortgage'] + listings_df['home_insurance'] + listings_df['property_tax'] + options.profit

    results = []
    async with aiohttp.ClientSession() as session:
        tasks = [process_listing(row, options, cache, args.cache_only, session) for _, row in listings_df.iterrows()]
        responses = await asyncio.gather(*tasks)
        results = [response for response in responses if response]

    save_cache(cache)
    return {"results": results}

if __name__ == "__main__":
    if not args.test:
        logging.info("RUNNING IN PROD MODE")
    else:
        logging.info("Running in TEST MODE")

    if args.cache_only:
        logging.info("RUNNING IN CACHE ONLY MODE")

    uvicorn.run("service:app", host="0.0.0.0", port=8000, reload=True)
