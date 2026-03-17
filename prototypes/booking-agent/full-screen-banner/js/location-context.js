/**
 * Location Context Provider
 * Via Transportation - Rider Agent
 * 
 * Gathers location data from GPS, map state, and saved places
 * to provide rich context to the AI agent.
 */

class LocationContextProvider {
    constructor(app) {
        this.app = app;
        this.currentLocation = null;
        this.mapState = null;
    }

    /**
     * Get full context snapshot for LLM
     */
    async getCurrentContext() {
        const context = {
            userLocation: this.getUserLocation(),
            mapState: this.getMapState(),
            savedPlaces: this.getSavedPlaces(),
            bookingContext: this.getBookingContext(),
            conversationHistory: this.getConversationHistory()
        };
        
        return context;
    }

    /**
     * Get user's current location
     */
    getUserLocation() {
        // Try to get real GPS location first
        if (this.currentLocation) {
            return this.currentLocation;
        }
        
        // Fall back to mock current location from config
        return CONFIG.mockData.currentLocation;
    }

    /**
     * Request GPS permission and get user's location
     */
    async requestUserLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                console.warn('Geolocation not supported');
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    
                    // Reverse geocode to get address
                    let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                    
                    if (window.google && window.google.maps) {
                        try {
                            const geocoder = new google.maps.Geocoder();
                            const result = await new Promise((res, rej) => {
                                geocoder.geocode(
                                    { location: { lat, lng } },
                                    (results, status) => {
                                        if (status === 'OK' && results[0]) {
                                            res(results[0].formatted_address);
                                        } else {
                                            rej(new Error('Geocoding failed'));
                                        }
                                    }
                                );
                            });
                            address = result;
                        } catch (error) {
                            console.warn('Reverse geocoding failed:', error);
                        }
                    }
                    
                    this.currentLocation = {
                        name: 'Current location',
                        address: address,
                        lat: lat,
                        lng: lng
                    };
                    
                    resolve(this.currentLocation);
                },
                (error) => {
                    console.warn('Failed to get user location:', error);
                    resolve(null);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 60000 // Cache for 1 minute
                }
            );
        });
    }

    /**
     * Get map state (center, zoom, bounds)
     */
    getMapState() {
        if (!this.app.map) {
            return null;
        }

        try {
            const center = this.app.map.getCenter();
            const zoom = this.app.map.getZoom();
            const bounds = this.app.map.getBounds();
            
            let visibleBounds = null;
            if (bounds) {
                const ne = bounds.getNorthEast();
                const sw = bounds.getSouthWest();
                visibleBounds = `NE: (${ne.lat().toFixed(4)}, ${ne.lng().toFixed(4)}), SW: (${sw.lat().toFixed(4)}, ${sw.lng().toFixed(4)})`;
            }
            
            this.mapState = {
                center: {
                    lat: center.lat(),
                    lng: center.lng()
                },
                zoom: zoom,
                visibleBounds: visibleBounds
            };
            
            return this.mapState;
        } catch (error) {
            console.warn('Failed to get map state:', error);
            return null;
        }
    }

    /**
     * Get saved places from config
     */
    getSavedPlaces() {
        return CONFIG.mockData.savedPlaces;
    }

    /**
     * Get current booking context from AI agent
     */
    getBookingContext() {
        if (!this.app.aiAgent) {
            return {};
        }
        
        return this.app.aiAgent.bookingContext;
    }

    /**
     * Get conversation history from AI agent
     */
    getConversationHistory() {
        if (!this.app.aiAgent) {
            return [];
        }
        
        return this.app.aiAgent.conversationHistory;
    }

    /**
     * Format context for LLM consumption (text description)
     */
    formatForLLM(context) {
        let description = '';
        
        if (context.userLocation) {
            description += `User is at: ${context.userLocation.address}\n`;
        }
        
        if (context.mapState) {
            description += `Map is centered at: ${context.mapState.center.lat.toFixed(4)}, ${context.mapState.center.lng.toFixed(4)}\n`;
        }
        
        if (context.savedPlaces) {
            description += `Saved places: `;
            const places = Object.values(context.savedPlaces).map(p => p.name);
            description += places.join(', ') + '\n';
        }
        
        if (context.bookingContext && context.bookingContext.destination) {
            description += `Current booking: ${context.bookingContext.origin || 'current location'} → ${context.bookingContext.destination}\n`;
        }
        
        return description;
    }

    /**
     * Get nearby places from Google Maps Places API (optional enhancement)
     */
    async getNearbyPlaces(location, radius = 500) {
        if (!window.google || !window.google.maps || !window.google.maps.places) {
            console.warn('Google Places API not available');
            return [];
        }

        return new Promise((resolve) => {
            const service = new google.maps.places.PlacesService(
                document.createElement('div')
            );
            
            const request = {
                location: new google.maps.LatLng(location.lat, location.lng),
                radius: radius,
                type: ['restaurant', 'cafe', 'store', 'point_of_interest']
            };
            
            service.nearbySearch(request, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    // Format results
                    const places = results.slice(0, 5).map(place => ({
                        name: place.name,
                        address: place.vicinity,
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng(),
                        types: place.types
                    }));
                    resolve(places);
                } else {
                    console.warn('Places search failed:', status);
                    resolve([]);
                }
            });
        });
    }
}

// Export
window.LocationContextProvider = LocationContextProvider;
