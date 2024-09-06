import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { FaSearch, FaMoon, FaSpinner, FaSlidersH } from 'react-icons/fa';

export default function Home() {
  const [formData, setFormData] = useState({
    location: "",
    num_listings: 1,
    profit: 500,
    down_payment: 20,
    interest_rate: 7.0,
    loan_term_years: 30,
  });

  const [results, setResults] = useState([]);
  const [expandedRows, setExpandedRows] = useState({});
  const [sortConfig, setSortConfig] = useState(null);
  const [filterZipCode, setFilterZipCode] = useState('');
  const [filterMortgageMin, setFilterMortgageMin] = useState('');
  const [filterMortgageMax, setFilterMortgageMax] = useState('');
  const [filterHomeMin, setFilterHomeMin] = useState('');
  const [filterHomeMax, setFilterHomeMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({
    zipCode: '',
    mortgageMin: '',
    mortgageMax: '',
    homeMin: '',
    homeMax: ''
  });
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    if (name === "filterZipCode") setFilterZipCode(value);
    if (name === "filterMortgageMin") setFilterMortgageMin(value);
    if (name === "filterMortgageMax") setFilterMortgageMax(value);
    if (name === "filterHomeMin") setFilterHomeMin(value);
    if (name === "filterHomeMax") setFilterHomeMax(value);
  };

  const applyFilters = () => {
    setAppliedFilters({
      zipCode: filterZipCode,
      mortgageMin: filterMortgageMin,
      mortgageMax: filterMortgageMax,
      homeMin: filterHomeMin,
      homeMax: filterHomeMax
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      console.log('Submitting data:', formData);
      const response = await axios.post('http://localhost:8000/process_listings', formData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('API response:', response.data);
      setResults(response.data.results);
    } catch (error) {
      console.error('Error submitting data:', error);
      alert('Failed to submit data');
    }
    setLoading(false);
  };

  const toggleRowExpansion = (index) => {
    setExpandedRows((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const sortResults = (key) => {
    let direction = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const sortedResults = useMemo(() => {
    let sortableResults = [...results];
    if (sortConfig !== null) {
      sortableResults.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableResults;
  }, [results, sortConfig]);

  const filteredResults = useMemo(() => {
    console.log('Applying filters:', appliedFilters);
    return sortedResults.filter(result => {
      const matchesZip = appliedFilters.zipCode ? result.address.includes(appliedFilters.zipCode) : true;
      const matchesMortgage = (appliedFilters.mortgageMin ? result.mortgage >= appliedFilters.mortgageMin : true) &&
                              (appliedFilters.mortgageMax ? result.mortgage <= appliedFilters.mortgageMax : true);
      const matchesHomePrice = (appliedFilters.homeMin ? result.list_price >= appliedFilters.homeMin : true) &&
                              (appliedFilters.homeMax ? result.list_price <= appliedFilters.homeMax : true);
      console.log('Result:', result);
      console.log('matchesZip:', matchesZip, 'matchesMortgage:', matchesMortgage, 'matchesHomePrice:', matchesHomePrice);
      return matchesZip && matchesMortgage && matchesHomePrice;
    });
  }, [sortedResults, appliedFilters]);

  const toggleDarkMode = () => {
    setDarkMode(prevDarkMode => {
      const newDarkMode = !prevDarkMode;
      localStorage.setItem('darkMode', newDarkMode);
      return newDarkMode;
    });
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gradient-to-tr from-fuchsia-200 via-orange-200 to-yellow-200'} flex flex-col items-center justify-start p-8`}>
      <button
        className="absolute top-4 right-4 p-2 bg-white text-gray-600 rounded-full hover:bg-gray-200 transition duration-150 ease-in-out"
        onClick={toggleDarkMode}
        title="Dark Mode"
      >
        <FaMoon />
      </button>
      <div className={`p-8 mb-8 rounded-lg shadow-lg max-w-4xl w-full space-y-4 ${darkMode ? 'bg-gray-800 text-white' : 'bg-white'}`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-wrap gap-4 justify-center items-end">
            <div className="flex flex-col w-32">
              <label className="block">Location</label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                className={`mt-1 block rounded-md shadow-lg px-2 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white border border-gray-300 shadow-sm'}`}
              />
            </div>
            <div className="flex flex-col w-16">
              <label title="Number of results to show" className="block">Results</label>
              <input
                type="text"
                name="num_listings"
                value={formData.num_listings}
                pattern="\d*"
                onChange={handleChange}
                className={`mt-1 block rounded-md shadow-lg px-2 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white border border-gray-300 shadow-sm'}`}
              />
            </div>
            <div className="flex flex-col w-16">
              <label title="Target net leveraged income" className="block">Profit</label>
              <input
                type="text"
                name="profit"
                value={formData.profit}
                pattern="\d*"
                onChange={handleChange}
                className={`mt-1 block rounded-md shadow-lg px-2 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white border border-gray-300 shadow-sm'}`}
              />
            </div>
            <div className="flex flex-col w-16">
              <label title="Down payment percentage" className="block">Down</label>
              <input
                type="text"
                name="down_payment"
                value={formData.down_payment}
                pattern="\d*"
                onChange={handleChange}
                className={`mt-1 block rounded-md shadow-lg px-2 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white border border-gray-300 shadow-sm'}`}
              />
            </div>
            <div className="flex flex-col w-16">
              <label title="Annual interest rate" className="block">Interest</label>
              <input
                type="text"
                name="interest_rate"
                value={formData.interest_rate}
                pattern="\d*"
                onChange={handleChange}
                className={`mt-1 block rounded-md shadow-lg px-2 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white border border-gray-300 shadow-sm'}`}
              />
            </div>
            <div className="flex flex-col w-16">
              <label title="Mortgage loan term in years." className="block">Term</label>
              <input
                type="text"
                name="loan_term_years"
                value={formData.loan_term_years}
                pattern="\d*"
                onChange={handleChange}
                className={`mt-1 block rounded-md shadow-lg px-2 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white border border-gray-300 shadow-sm'}`}
              />
            </div>
            <button
              type="submit"
              className="h-6 p-2 bg-stone-400 text-white rounded-md hover:bg-stone-600 transition duration-150 ease-in-out flex items-center justify-center"
            >
              {loading ? <FaSpinner className="animate-spin" /> : <FaSearch />}
            </button>
          </div>
        </form>
      </div>

      {results.length > 0 && (
        <div className={`p-8 rounded-lg shadow-lg max-w-4xl w-full ${darkMode ? 'bg-gray-800 text-white' : 'bg-white'}`} style={{ minHeight: '200px' }}>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 ${darkMode ? 'bg-transparent text-white hover:bg-stone-600' : 'bg-transparent text-gray-400 hover:text-grey-300' } transition duration-150 ease-in-out`}
            >
              <FaSlidersH />
            </button>
          </div>
          {showFilters && (
            <div className={`p-4 rounded-lg shadow-lg mb-4 w-full space-y-4 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="flex flex-col">
                  <label className="block">Zip Code</label>
                  <input
                    type="text"
                    name="filterZipCode"
                    value={filterZipCode}
                    onChange={handleFilterChange}
                    className={`mt-1 block rounded-md shadow-lg px-2 ${darkMode ? 'bg-gray-600 text-white' : 'bg-white border border-gray-300 shadow-sm'}`}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block">Min Mortgage</label>
                  <input
                    type="text"
                    name="filterMortgageMin"
                    value={filterMortgageMin}
                    pattern="\d*"
                    onChange={handleFilterChange}
                    className={`mt-1 block rounded-md shadow-lg px-2 ${darkMode ? 'bg-gray-600 text-white' : 'bg-white border border-gray-300 shadow-sm'}`}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block">Max Mortgage</label>
                  <input
                    type="text"
                    name="filterMortgageMax"
                    value={filterMortgageMax}
                    pattern="\d*"
                    onChange={handleFilterChange}
                    className={`mt-1 block rounded-md shadow-lg px-2 ${darkMode ? 'bg-gray-600 text-white' : 'bg-white border border-gray-300 shadow-sm'}`}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block">Min Home Price</label>
                  <input
                    type="text"
                    name="filterHomeMin"
                    value={filterHomeMin}
                    pattern="\d*"
                    onChange={handleFilterChange}
                    className={`mt-1 block rounded-md shadow-lg px-2 ${darkMode ? 'bg-gray-600 text-white' : 'bg-white border border-gray-300 shadow-sm'}`}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block">Max Home Price</label>
                  <input
                    type="text"
                    name="filterHomeMax"
                    value={filterHomeMax}
                    pattern="\d*"
                    onChange={handleFilterChange}
                    className={`mt-1 block rounded-md shadow-lg px-2 ${darkMode ? 'bg-gray-600 text-white' : 'bg-white border border-gray-300 shadow-sm'}`}
                  />
                </div>
              </div>
              <div className="flex justify-center mt-4">
                <button
                  onClick={applyFilters}
                  className="py-2 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition duration-150 ease-in-out"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className={`border-b p-2 cursor-pointer ${darkMode ? 'border-gray-600' : 'border-gray-300'}`} onClick={() => sortResults('address')}>Address</th>
                  <th className={`border-b p-2 cursor-pointer ${darkMode ? 'border-gray-600' : 'border-gray-300'}`} onClick={() => sortResults('list_price')}>Price</th>
                  <th className={`border-b p-2 cursor-pointer ${darkMode ? 'border-gray-600' : 'border-gray-300'}`} onClick={() => sortResults('total_operating_cost')}>Operating Cost</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((result, index) => (
                  <React.Fragment key={index}>
                    <tr
                      className={`${result.is_profitable ? darkMode ? "bg-green-800" : "bg-green-100" : ""}`}
                      onClick={() => toggleRowExpansion(index)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={`border-b p-2 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(result.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`underline ${darkMode ? 'text-white' : 'text-gray-700'}`}
                          onClick={(e) => e.stopPropagation()} // Prevent row click when link is clicked
                        >
                          {result.address}
                        </a>
                      </td>
                      <td className={`border-b p-2 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>${result.list_price.toLocaleString()}</td>
                      <td className={`border-b p-2 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>${result.total_operating_cost.toLocaleString()}</td>
                    </tr>
                    {expandedRows[index] && (
                      <tr>
                        <td colSpan="3" className="p-2">
                          <div className={`p-4 rounded-md shadow-sm ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100'}`}>
                            <p><strong>Estimated Rental Value:</strong> ${result.rental_value.toLocaleString()}</p>
                            <p><strong>Target Rental Rate:</strong> ${result.rental_price.toLocaleString()}</p>
                            <p><strong>Price Gap:</strong> ${result.differential.toLocaleString()}</p>
                            {result.adjusted_profit !== null && result.adjusted_profit !== 0 && (
                              <p><strong>Break-even Margin:</strong> ${result.adjusted_profit.toLocaleString()}</p>
                            )}
                            <p><strong>Min Estimated Rental Rate:</strong> ${result.rentcast_rent_low.toLocaleString()}</p>
                            <p><strong>Max Estimated Rental Value:</strong> ${result.rentcast_rent_high.toLocaleString()}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
