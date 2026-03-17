/**
 * Payment Modal Component
 * Handles payment method selection from chip click
 */

class PaymentModal {
    constructor(app) {
        this.app = app;
        this.modal = null;
        this.currentMethod = null;
    }
    
    /**
     * Open the payment modal
     */
    open(currentMethod = null) {
        console.log('[PaymentModal] Opening with current method:', currentMethod);
        
        this.currentMethod = currentMethod;
        
        // Create modal
        this.createModal();
        
        // Show modal
        setTimeout(() => {
            this.modal.classList.add('active');
        }, 10);
    }
    
    /**
     * Create modal HTML
     */
    createModal() {
        // Remove existing modal if any
        const existing = document.getElementById('payment-modal');
        if (existing) {
            existing.remove();
        }
        
        const methods = CONFIG.mockData.paymentMethods;
        
        // Create modal structure
        const modal = document.createElement('div');
        modal.id = 'payment-modal';
        modal.className = 'payment-modal';
        
        const optionsHtml = methods.map(method => {
            const isSelected = this.currentMethod && method.id === this.currentMethod.id;
            let methodName;
            if (method.type === 'ride-credit') {
                const balance = method.balance ? `$${method.balance.toFixed(2)}` : '$0.00';
                methodName = `${method.name} (${balance} available)`;
            } else {
                methodName = `${method.type.charAt(0).toUpperCase() + method.type.slice(1)} **** ${method.last4}`;
            }
            
            // Generate icon based on payment type
            let iconHtml = this.getPaymentIcon(method.type);
            
            return `
                <label class="payment-modal-option ${isSelected ? 'selected' : ''}" data-method-id="${method.id}">
                    <div class="payment-radio ${isSelected ? 'checked' : ''}">
                        <div class="payment-radio-inner"></div>
                    </div>
                    <div class="payment-icon">${iconHtml}</div>
                    <span class="payment-label">${methodName}</span>
                </label>
            `;
        }).join('');
        
        modal.innerHTML = `
            <div class="payment-modal-backdrop"></div>
            <div class="payment-modal-content">
                <div class="payment-modal-header">
                    <h2>Payment method</h2>
                    <button class="payment-modal-close" id="payment-close-btn">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                
                <div class="payment-modal-body">
                    <div class="payment-modal-options">
                        ${optionsHtml}
                    </div>
                </div>
                
                <div class="payment-modal-footer">
                    <button class="payment-confirm-btn" id="payment-confirm-btn">Confirm</button>
                </div>
            </div>
        `;
        
        // Append to app container to keep modal within the UI
        const appContainer = document.getElementById('app');
        appContainer.appendChild(modal);
        this.modal = modal;
        
        // Add event listeners
        document.getElementById('payment-close-btn').addEventListener('click', () => this.close());
        modal.querySelector('.payment-modal-backdrop').addEventListener('click', () => this.close());
        document.getElementById('payment-confirm-btn').addEventListener('click', () => this.confirm());
        
        // Add click handlers for each option
        modal.querySelectorAll('.payment-modal-option').forEach(option => {
            option.addEventListener('click', () => {
                const methodId = option.dataset.methodId;
                const method = methods.find(m => m.id === methodId);
                this.selectMethod(method, option);
            });
        });
    }
    
    /**
     * Get payment icon SVG based on type
     */
    getPaymentIcon(type) {
        if (type === 'mastercard') {
            return `<svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                <rect width="32" height="20" rx="3" fill="#F5F5F5"/>
                <circle cx="12" cy="10" r="6" fill="#EB001B"/>
                <circle cx="20" cy="10" r="6" fill="#F79E1B"/>
                <path d="M16 5.5C17.5 6.7 18.5 8.2 18.5 10C18.5 11.8 17.5 13.3 16 14.5C14.5 13.3 13.5 11.8 13.5 10C13.5 8.2 14.5 6.7 16 5.5Z" fill="#FF5F00"/>
            </svg>`;
        } else if (type === 'visa') {
            return `<svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                <rect width="32" height="20" rx="3" fill="#F5F5F5"/>
                <text x="6" y="14" font-family="Arial" font-size="10" font-weight="bold" fill="#1A1F71">VISA</text>
            </svg>`;
        } else if (type === 'ride-credit') {
            return `<svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                <rect width="32" height="20" rx="3" fill="#EBF5FF"/>
                <path d="M16 4L18.5 9H13.5L16 4Z" fill="#007AFF"/>
                <rect x="11" y="9" width="10" height="7" rx="1" fill="#007AFF"/>
            </svg>`;
        }
        return '';
    }
    
    /**
     * Select a payment method
     */
    selectMethod(method, optionElement) {
        // Update current method
        this.currentMethod = method;
        
        // Update UI to show selection
        this.modal.querySelectorAll('.payment-modal-option').forEach(option => {
            const isSelected = option.dataset.methodId === method.id;
            option.classList.toggle('selected', isSelected);
            option.querySelector('.payment-radio').classList.toggle('checked', isSelected);
        });
    }
    
    /**
     * Confirm selection
     */
    async confirm() {
        if (!this.currentMethod) {
            console.warn('[PaymentModal] No method selected');
            return;
        }
        
        console.log('[PaymentModal] Confirming selection:', this.currentMethod);
        
        // Update booking context directly
        this.app.aiAgent.bookingContext.paymentMethod = this.currentMethod;
        
        // Update any displayed chips
        this.updatePaymentChips();
        
        // Close modal
        this.close();
        
        // Optionally speak confirmation
        const paymentName = this.currentMethod.type === 'ride-credit' 
            ? 'Ride Credit' 
            : `${this.currentMethod.type.charAt(0).toUpperCase() + this.currentMethod.type.slice(1)} ending in ${this.currentMethod.last4}`;
        
        this.app.aiAgent.speak(`Payment method updated to ${paymentName}.`);
    }
    
    /**
     * Update payment chips displayed in chat and active ride card
     */
    updatePaymentChips() {
        const newLabel = this.currentMethod.last4 || this.currentMethod.name;
        let newIcon = '<img src="assets/payment_method.svg" class="icon-img" alt="Payment">';
        if (this.currentMethod.type === 'mastercard') {
            newIcon = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="display:inline-block;vertical-align:middle;"><circle cx="6" cy="8" r="5" fill="#EB001B" opacity="0.8"/><circle cx="10" cy="8" r="5" fill="#F79E1B" opacity="0.8"/></svg>';
        }
        
        // Update chips in message-chips containers
        const paymentChips = document.querySelectorAll('.message-chips .chip');
        paymentChips.forEach(chip => {
            const icon = chip.querySelector('.icon');
            if (icon && (icon.innerHTML.includes('payment_method') || icon.innerHTML.includes('EB001B'))) {
                const label = chip.querySelector('span:not(.icon)');
                if (label) {
                    label.textContent = newLabel;
                }
                icon.innerHTML = newIcon;
            }
        });
        
        // Update chip in active ride card (microtransit footer)
        const ridePaymentChip = document.getElementById('ride-payment-chip');
        if (ridePaymentChip) {
            const icon = ridePaymentChip.querySelector('.icon');
            const label = ridePaymentChip.querySelector('span:not(.icon)');
            if (icon) {
                icon.innerHTML = newIcon;
            }
            if (label) {
                label.textContent = newLabel;
            }
        }
        
        // Update chip in trip details footer
        const tripPaymentChip = document.getElementById('trip-payment-chip');
        if (tripPaymentChip) {
            const icon = tripPaymentChip.querySelector('.icon');
            const label = tripPaymentChip.querySelector('span:not(.icon)');
            if (icon) {
                icon.innerHTML = newIcon;
            }
            if (label) {
                label.textContent = newLabel;
            }
        }
    }
    
    /**
     * Close modal
     */
    close() {
        if (this.modal) {
            this.modal.classList.remove('active');
            setTimeout(() => {
                this.modal.remove();
                this.modal = null;
            }, 300);
        }
    }
}
