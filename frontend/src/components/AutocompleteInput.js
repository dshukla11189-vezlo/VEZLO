import React, { useState, useRef, useEffect } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Clock } from 'lucide-react';

export default function AutocompleteInput({ 
  label, 
  placeholder, 
  items = [], 
  value, 
  onSelect, 
  displayKey = 'name',
  secondaryKey = null,
  testId,
  storageKey = null // For recent selections
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredItems, setFilteredItems] = useState([]);
  const [recentItems, setRecentItems] = useState([]);
  const wrapperRef = useRef(null);

  useEffect(() => {
    // Load recent selections from localStorage
    if (storageKey) {
      const recent = localStorage.getItem(storageKey);
      if (recent) {
        try {
          const recentIds = JSON.parse(recent);
          const recentItemsData = recentIds
            .map(id => items.find(item => item.id === id))
            .filter(Boolean);
          setRecentItems(recentItemsData);
        } catch (e) {
          console.error('Error loading recent items:', e);
        }
      }
    }
  }, [items, storageKey]);

  useEffect(() => {
    // Click outside handler
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Filter items based on search term
    if (searchTerm.length > 0) {
      const filtered = items.filter(item => {
        const primaryMatch = item[displayKey]?.toLowerCase().includes(searchTerm.toLowerCase());
        const secondaryMatch = secondaryKey ? item[secondaryKey]?.toLowerCase().includes(searchTerm.toLowerCase()) : false;
        return primaryMatch || secondaryMatch;
      });
      setFilteredItems(filtered);
    } else {
      setFilteredItems(items);
    }
  }, [searchTerm, items, displayKey, secondaryKey]);

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
    setShowSuggestions(true);
  };

  const handleSelect = (item) => {
    setSearchTerm(item[displayKey]);
    setShowSuggestions(false);
    onSelect(item);
    
    // Save to recent selections
    if (storageKey) {
      const recent = localStorage.getItem(storageKey);
      let recentIds = recent ? JSON.parse(recent) : [];
      
      // Remove if already exists
      recentIds = recentIds.filter(id => id !== item.id);
      
      // Add to front
      recentIds.unshift(item.id);
      
      // Keep only last 5
      recentIds = recentIds.slice(0, 5);
      
      localStorage.setItem(storageKey, JSON.stringify(recentIds));
    }
  };

  const handleFocus = () => {
    setShowSuggestions(true);
  };

  const displayItems = searchTerm.length === 0 && recentItems.length > 0 
    ? [...recentItems, ...filteredItems.filter(item => !recentItems.find(r => r.id === item.id))]
    : filteredItems;

  return (
    <div ref={wrapperRef} className="relative">
      {label && <Label className="text-xs mb-1 block">{label}</Label>}
      <Input
        type="text"
        placeholder={placeholder}
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={handleFocus}
        data-testid={testId}
        autoComplete="off"
      />
      
      {showSuggestions && displayItems.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {searchTerm.length === 0 && recentItems.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b flex items-center gap-2">
                <Clock size={12} />
                RECENT
              </div>
              {recentItems.map((item, index) => (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100"
                  data-testid={`recent-${index}`}
                >
                  <div className="font-medium text-sm text-gray-900">{item[displayKey]}</div>
                  {secondaryKey && item[secondaryKey] && (
                    <div className="text-xs text-gray-500">{item[secondaryKey]}</div>
                  )}
                </div>
              ))}
              {filteredItems.filter(item => !recentItems.find(r => r.id === item.id)).length > 0 && (
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b">
                  ALL
                </div>
              )}
            </>
          )}
          
          {displayItems.slice(0, 50).map((item, index) => {
            // Skip if already shown in recent
            if (searchTerm.length === 0 && recentItems.find(r => r.id === item.id)) {
              return null;
            }
            
            return (
              <div
                key={item.id || index}
                onClick={() => handleSelect(item)}
                className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                data-testid={`suggestion-${index}`}
              >
                <div className="font-medium text-sm text-gray-900">{item[displayKey]}</div>
                {secondaryKey && item[secondaryKey] && (
                  <div className="text-xs text-gray-500">{item[secondaryKey]}</div>
                )}
              </div>
            );
          })}
          {filteredItems.length > 50 && (
            <div className="px-4 py-2 text-xs text-gray-500 text-center bg-gray-50">
              Showing 50 of {filteredItems.length} results. Keep typing to narrow down...
            </div>
          )}
        </div>
      )}
      
      {showSuggestions && searchTerm && filteredItems.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-sm text-gray-500 text-center">
          No results found
        </div>
      )}
    </div>
  );
}
