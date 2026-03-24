/**
 * Geocoding Service (Simulated)
 * Via Transportation - Rider Agent
 */

class GeocodingService {
    constructor() {
        this.mockLocations = {
            'work': CONFIG.mockData.savedPlaces.work,
            'home': CONFIG.mockData.savedPlaces.home,
            'stadium': CONFIG.mockData.savedPlaces.stadium,
            'att stadium': CONFIG.mockData.savedPlaces.stadium,
            'at&t stadium': CONFIG.mockData.savedPlaces.stadium,
            'current location': CONFIG.mockData.currentLocation,
            '1124 w inwood drive': CONFIG.mockData.currentLocation,
            '700 highlander blvd': CONFIG.mockData.savedPlaces.work,
            '1 att way': CONFIG.mockData.savedPlaces.stadium
        };
    }
    
    /**
     * Check if location is within Arlington, TX service area
     */
    isWithinServiceArea(lat, lng) {
        const bounds = CONFIG.serviceArea.bounds;
        return lat >= bounds.south && 
               lat <= bounds.north && 
               lng >= bounds.west && 
               lng <= bounds.east;
    }
    
    /**
     * Get service area error message
     */
    getServiceAreaError(location) {
        return {
            success: false,
            error: 'out_of_service_area',
            message: `${location.address || 'This address'} is outside Arlington's service area. Please provide an address within Arlington, Texas.`,
            suggestChooseOnMap: true
        };
    }

    /**
     * Geocode an address (simulated or real Google Maps)
     */
    async geocode(query) {
        try {
            let result;
            if (CONFIG.features.googleMaps && window.google && window.google.maps) {
                result = await this.geocodeWithGoogle(query);
            } else {
                result = await this.geocodeSimulated(query);
            }
            
            // Check service area for successful results
            if (result && result.success && result.location) {
                if (!this.isWithinServiceArea(result.location.lat, result.location.lng)) {
                    return this.getServiceAreaError(result.location);
                }
            }
            
            return result;
        } catch (error) {
            console.error('Geocoding failed:', error);
            return {
                success: false,
                error: 'geocoding_failed',
                message: 'Could not find this location. Please try a different address in Arlington, Texas.'
            };
        }
    }

    /**
     * Simulated geocoding
     */
    geocodeSimulated(query) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const normalized = query.toLowerCase().trim();
                
                // Exact match
                if (this.mockLocations[normalized]) {
                    const location = this.mockLocations[normalized];
                    resolve({
                        success: true,
                        location: location,
                        confidence: 1.0
                    });
                    return;
                }
                
                // Fuzzy match
                for (const [key, location] of Object.entries(this.mockLocations)) {
                    if (normalized.includes(key) || key.includes(normalized)) {
                        resolve({
                            success: true,
                            location: location,
                            confidence: 0.8
                        });
                        return;
                    }
                }
                
                // No match - check if it's a known city/location outside Arlington
                const outsideCities = [
                    { name: 'dallas', lat: 32.7767, lng: -96.7970 },
                    { name: 'fort worth', lat: 32.7555, lng: -97.3308 },
                    { name: 'fortworth', lat: 32.7555, lng: -97.3308 },
                    { name: 'irving', lat: 32.8140, lng: -96.9489 },
                    { name: 'grand prairie', lat: 32.7459, lng: -96.9978 },
                    { name: 'dfw', lat: 32.8998, lng: -97.0403 },
                    { name: 'dfw airport', lat: 32.8998, lng: -97.0403 },
                    { name: 'plano', lat: 33.0198, lng: -96.6989 },
                    { name: 'frisco', lat: 33.1507, lng: -96.8236 },
                    { name: 'new york', lat: 40.7128, lng: -74.0060 },
                    { name: 'nyc', lat: 40.7128, lng: -74.0060 },
                    { name: 'madison square garden', lat: 40.7505, lng: -73.9934 },
                    { name: 'msg', lat: 40.7505, lng: -73.9934 },
                    { name: 'houston', lat: 29.7604, lng: -95.3698 },
                    { name: 'austin', lat: 30.2672, lng: -97.7431 },
                    { name: 'san antonio', lat: 29.4241, lng: -98.4936 }
                ];
                
                // Check if query matches any outside city
                for (const city of outsideCities) {
                    if (normalized.includes(city.name) || city.name.includes(normalized)) {
                        // Return the outside location so it can be rejected
                        resolve({
                            success: true,
                            location: {
                                name: query,
                                address: query,
                                lat: city.lat,
                                lng: city.lng
                            },
                            confidence: 0.8
                        });
                        return;
                    }
                }
                
                // Unknown location - return error instead of random Arlington location
                resolve({
                    success: false,
                    error: 'not_found',
                    message: `Could not find "${query}". Please provide a specific address in Arlington, Texas.`
                });
            }, 300);
        });
    }

    /**
     * Validate that Google's result actually matches the query
     * Prevents partial matches like "Madison Square Garden" → "Madison Ave, Arlington"
     */
    isGoogleResultRelevant(query, formattedAddress) {
        // Extract meaningful words from query (ignore common words)
        const ignoreWords = new Set([
            'street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 
            'lane', 'ln', 'boulevard', 'blvd', 'way', 'place', 'pl', 'court', 'ct',
            'the', 'to', 'a', 'an', 'in', 'on', 'at', 'for', 'of', 'and',
            'get', 'me', 'take', 'book', 'ride', 'trip', 'go', 'going'
        ]);
        
        const queryWords = query.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '') // Remove special characters
            .split(/\s+/)
            .filter(word => word.length > 2 && !ignoreWords.has(word));
        
        const addressLower = formattedAddress.toLowerCase();
        
        // If query has no meaningful words after filtering, accept the result
        if (queryWords.length === 0) {
            return true;
        }
        
        // Count how many query words appear in the address
        const matchedWords = queryWords.filter(word => addressLower.includes(word));
        const matchRatio = matchedWords.length / queryWords.length;
        
        console.log(`Geocoding validation: query="${query}", address="${formattedAddress}"`);
        console.log(`  Query words: [${queryWords.join(', ')}], Matched: [${matchedWords.join(', ')}], Ratio: ${matchRatio}`);
        
        // Require at least 50% of meaningful words to match
        // This allows "AT&T Stadium" → "AT&T Way" but rejects "Madison Square Garden" → "Madison Ave"
        return matchRatio >= 0.5;
    }

    /**
     * Real Google Maps geocoding
     */
    async geocodeWithGoogle(query) {
        return new Promise((resolve) => {
            try {
                // Check if Google Maps is available
                if (!window.google || !window.google.maps || !window.google.maps.Geocoder) {
                    console.warn('Google Maps Geocoder not available, falling back to simulated');
                    return resolve(this.geocodeSimulated(query));
                }
                
                const geocoder = new google.maps.Geocoder();
                
                // Bias results to Arlington, TX
                const arlingtonBias = {
                    address: query + ', Arlington, TX',
                    bounds: new google.maps.LatLngBounds(
                        new google.maps.LatLng(CONFIG.serviceArea.bounds.south, CONFIG.serviceArea.bounds.west),
                        new google.maps.LatLng(CONFIG.serviceArea.bounds.north, CONFIG.serviceArea.bounds.east)
                    )
                };
                
                // Set a timeout to prevent hanging
                const timeoutId = setTimeout(() => {
                    console.warn('Google geocoding timeout, falling back to simulated');
                    resolve(this.geocodeSimulated(query));
                }, 3000);
                
                geocoder.geocode(arlingtonBias, (results, status) => {
                    clearTimeout(timeoutId);
                    
                    if (status === 'OK' && results && results[0]) {
                        const result = results[0];
                        
                        // IMPORTANT: Validate that the result actually matches the query
                        // This prevents partial matches like "Madison Square Garden" → "Madison Ave, Arlington"
                        if (!this.isGoogleResultRelevant(query, result.formatted_address)) {
                            console.warn(`Google result "${result.formatted_address}" doesn't match query "${query}", falling back to simulated`);
                            return resolve(this.geocodeSimulated(query));
                        }
                        
                        resolve({
                            success: true,
                            location: {
                                name: query,
                                address: result.formatted_address,
                                lat: result.geometry.location.lat(),
                                lng: result.geometry.location.lng()
                            },
                            confidence: 1.0
                        });
                    } else {
                        console.warn(`Google geocoding failed (${status}), falling back to simulated`);
                        // Fallback to simulated geocoding
                        resolve(this.geocodeSimulated(query));
                    }
                });
            } catch (error) {
                console.error('Google geocoding error:', error);
                // Fallback to simulated geocoding
                resolve(this.geocodeSimulated(query));
            }
        });
    }

    /**
     * Calculate distance between two points (in miles)
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 3959; // Earth's radius in miles
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lng2 - lng1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        
        return distance;
    }

    toRad(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Estimate trip duration based on distance (simulated)
     */
    estimateDuration(distance) {
        // Average speed: 20 mph in city
        const hours = distance / 20;
        const minutes = Math.round(hours * 60);
        return Math.max(5, minutes); // Minimum 5 minutes
    }

    /**
     * Generate route information
     */
    generateRoute(origin, destination) {
        const distance = this.calculateDistance(
            origin.lat, origin.lng,
            destination.lat, destination.lng
        );
        
        const duration = this.estimateDuration(distance);
        
        // Generate intermediate points for route visualization
        const steps = 5;
        const waypoints = [];
        for (let i = 1; i < steps; i++) {
            const ratio = i / steps;
            waypoints.push({
                lat: origin.lat + (destination.lat - origin.lat) * ratio,
                lng: origin.lng + (destination.lng - origin.lng) * ratio
            });
        }
        
        return {
            origin,
            destination,
            distance: distance.toFixed(1),
            duration,
            waypoints,
            // Transit legs (walk → bus → walk)
            legs: [
                { mode: 'walk', duration: 2, icon: '🚶' },
                { mode: 'bus', duration: duration - 4, icon: '🚌', line: 'YRT' },
                { mode: 'walk', duration: 2, icon: '🚶' }
            ]
        };
    }
}

// Export
window.GeocodingService = GeocodingService;
