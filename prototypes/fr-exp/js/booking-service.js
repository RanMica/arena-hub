/**
 * Booking Service (Mock Backend)
 * Via Transportation - Rider Agent
 */

class BookingService {
    constructor() {
        this.geocoding = new GeocodingService();
        this.currentBooking = null;
    }

    /**
     * Generate ride proposals based on booking request
     */
    async generateProposals(origin, destination, datetime, passengers) {
        try {
            // Geocode addresses if needed
            if (typeof origin === 'string') {
                const result = await this.geocoding.geocode(origin);
                if (!result || !result.success) {
                    if (result && result.error === 'out_of_service_area') {
                        throw new Error('ORIGIN_OUT_OF_SERVICE_AREA: ' + result.message);
                    }
                    if (result && result.error === 'not_found') {
                        throw new Error('ORIGIN_NOT_FOUND: ' + result.message);
                    }
                    throw new Error('Failed to geocode origin: ' + (result?.message || 'Unknown location'));
                }
                origin = result.location;
            } else if (origin && origin.lat && origin.lng) {
                // Validate coordinates are within service area
                if (!this.geocoding.isWithinServiceArea(origin.lat, origin.lng)) {
                    throw new Error('ORIGIN_OUT_OF_SERVICE_AREA: ' + (origin.address || origin.name || 'Origin') + ' is outside Arlington\'s service area. Please provide an address within Arlington, Texas.');
                }
            }
            
            if (typeof destination === 'string') {
                const result = await this.geocoding.geocode(destination);
                if (!result || !result.success) {
                    if (result && result.error === 'out_of_service_area') {
                        throw new Error('DESTINATION_OUT_OF_SERVICE_AREA: ' + result.message);
                    }
                    if (result && result.error === 'not_found') {
                        throw new Error('DESTINATION_NOT_FOUND: ' + result.message);
                    }
                    throw new Error('Failed to geocode destination: ' + (result?.message || 'Unknown location'));
                }
                destination = result.location;
            } else if (destination && destination.lat && destination.lng) {
                // Validate coordinates are within service area
                if (!this.geocoding.isWithinServiceArea(destination.lat, destination.lng)) {
                    throw new Error('DESTINATION_OUT_OF_SERVICE_AREA: ' + (destination.address || destination.name || 'Destination') + ' is outside Arlington\'s service area. Please provide an address within Arlington, Texas.');
                }
            }
            
            // Generate route
            const route = this.geocoding.generateRoute(origin, destination);
            
            // Simulate delay
            await this.delay(CONFIG.timing.proposalGenerationDelay);
            
            // Create 3 proposals with slight variations
            const baseTime = this.parseDateTime(datetime);
            
            const proposals = [
                {
                    id: 'proposal-1',
                    origin,
                    destination,
                    pickupTime: new Date(baseTime.getTime() - 2 * 60000), // 2 min earlier
                    arrivalTime: new Date(baseTime.getTime() + (route.duration - 2) * 60000),
                    duration: route.duration,
                    price: CONFIG.pricing.basePrice * (passengers || 1), // $2 per passenger
                    route,
                    legs: route.legs
                },
                {
                    id: 'proposal-2',
                    origin,
                    destination,
                    pickupTime: baseTime,
                    arrivalTime: new Date(baseTime.getTime() + route.duration * 60000),
                    duration: route.duration,
                    price: CONFIG.pricing.basePrice * (passengers || 1), // $2 per passenger
                    route,
                    legs: route.legs
                },
                {
                    id: 'proposal-3',
                    origin,
                    destination,
                    pickupTime: new Date(baseTime.getTime() + 5 * 60000), // 5 min later
                    arrivalTime: new Date(baseTime.getTime() + (route.duration + 5) * 60000),
                    duration: route.duration,
                    price: CONFIG.pricing.basePrice * (passengers || 1), // $2 per passenger
                    route,
                    legs: route.legs
                }
            ];
            
            return proposals;
        } catch (error) {
            console.error('Error generating proposals:', error);
            throw error;
        }
    }

    /**
     * Confirm booking
     */
    async confirmBooking(proposal, paymentMethod, passengers) {
        await this.delay(CONFIG.timing.bookingConfirmationDelay);
        
        this.currentBooking = {
            id: `booking-${Date.now()}`,
            proposal,
            paymentMethod,
            passengers,
            status: 'confirmed',
            confirmedAt: new Date()
        };
        
        return this.currentBooking;
    }

    /**
     * Find a driver (simulated)
     */
    async findDriver() {
        await this.delay(CONFIG.timing.driverMatchDelay);
        
        // Select random driver
        const drivers = CONFIG.mockData.drivers;
        const driver = drivers[Math.floor(Math.random() * drivers.length)];
        
        // Calculate initial ETA
        const eta = Math.floor(Math.random() * 15) + 15; // 15-30 min
        
        return {
            ...driver,
            eta,
            status: 'on_way'
        };
    }

    /**
     * Cancel booking
     */
    async cancelBooking(bookingId) {
        await this.delay(1000);
        
        if (this.currentBooking && this.currentBooking.id === bookingId) {
            this.currentBooking.status = 'cancelled';
            return { success: true };
        }
        
        return { success: false, error: 'Booking not found' };
    }

    /**
     * Parse datetime string to Date object
     */
    parseDateTime(datetime) {
        const now = new Date();
        
        if (datetime === 'now' || !datetime) {
            return new Date(now.getTime() + 7 * 60000); // 7 minutes from now (pickup time)
        }
        
        // Parse "today at 14:00"
        const timeMatch = datetime.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const date = new Date(now);
            date.setHours(hours, minutes, 0, 0);
            
            // If time has passed today, assume tomorrow
            if (date < now) {
                date.setDate(date.getDate() + 1);
            }
            
            return date;
        }
        
        // Default to 7 minutes from now
        return new Date(now.getTime() + 7 * 60000);
    }

    /**
     * Format time
     */
    formatTime(date) {
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        return `${displayHours}:${minutes}`;
    }

    /**
     * Calculate time from now
     */
    getTimeFromNow(date) {
        const now = new Date();
        const diff = Math.floor((date - now) / 60000); // difference in minutes
        
        if (diff < 0) return 'Now';
        if (diff === 0) return 'Now';
        if (diff < 60) return `In ${diff} min`;
        
        const hours = Math.floor(diff / 60);
        const mins = diff % 60;
        return `In ${hours}h ${mins}m`;
    }

    /**
     * Utility delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export
window.BookingService = BookingService;
