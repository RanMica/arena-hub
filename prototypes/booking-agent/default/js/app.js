/**
 * Main Application Controller
 * Via Transportation - Rider Agent
 */

class App {
    constructor() {
        this.currentScreen = 'home';
        this.bookingService = new BookingService();
        this.aiAgent = new AIAgent(this.bookingService);
        this.currentProposals = null;
        this.selectedProposal = null;
        this.currentDriver = null;
        this.walkingDirections = null;
        this.isRecording = false;
        this.recognition = null;
        this.recordingContext = null; // Track where we're recording from: 'voice-screen' or 'chat-screen'
        this.currentTranscript = ''; // Store transcript to avoid race conditions
        this.gotFinalResult = false; // Track if we got a final result
        this.recordingStartTime = null; // Track when recording started
        this.recognitionReady = false; // Track if recognition is ready to capture audio
        this.autoStopTimer = null; // Timer to auto-stop recording
        this.recordingDuration = 10000; // Auto-stop after 10 seconds
        
        // Initialize scheduling modal
        this.schedulingModal = new SchedulingModal(this);
        
        // Initialize payment modal
        this.paymentModal = new PaymentModal(this);
        
        // Initialize passengers modal
        this.passengersModal = new PassengersModal(this);
        
        // Initialize location context provider
        this.locationContext = new LocationContextProvider(this);
        this.aiAgent.locationContext = this.locationContext;
        
        // Initialize audio context for feedback sounds
        this.audioContext = null;
        
        this.init();
    }
    
    /**
     * Play a subtle feedback sound when processing starts
     */
    playProcessingSound() {
        try {
            // Initialize audio context on first use (requires user interaction)
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const ctx = this.audioContext;
            const now = ctx.currentTime;
            
            // Create a pleasant two-tone chime
            const playTone = (freq, startTime, duration) => {
                const oscillator = ctx.createOscillator();
                const gainNode = ctx.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(ctx.destination);
                
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(freq, startTime);
                
                // Soft attack and decay
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
                
                oscillator.start(startTime);
                oscillator.stop(startTime + duration);
            };
            
            // Play two ascending tones for a pleasant "thinking" sound
            playTone(523.25, now, 0.15);        // C5
            playTone(659.25, now + 0.1, 0.2);   // E5
            
        } catch (e) {
            console.log('Audio not available:', e);
        }
    }

    init() {
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize speech recognition if available
        if (CONFIG.features.voiceInput) {
            this.initializeSpeechRecognition();
        }
        
        // Google Maps will be initialized via callback
    }

    /**
     * Initialize Google Maps
     */
    initializeMap() {
        const mapElement = document.getElementById('home-map');
        
        if (!mapElement) return;
        
        // If Google Maps is disabled, don't try to initialize
        if (!CONFIG.features.googleMaps) {
            console.log('Google Maps disabled in config');
            return;
        }
        
        try {
            if (!window.google || !window.google.maps) {
                throw new Error('Google Maps not loaded');
            }

            // Get current theme for map styles
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            
            this.map = new google.maps.Map(mapElement, {
                center: { 
                    lat: CONFIG.mockData.currentLocation.lat, 
                    lng: CONFIG.mockData.currentLocation.lng 
                },
                zoom: 15, // Zoomed in to show neighborhood detail
                disableDefaultUI: true,
                styles: getMapStyles(currentTheme)
            });

            // Add a blue dot marker for user's current location (stays fixed on map)
            const currentLocationMarker = new google.maps.Marker({
                position: { 
                    lat: CONFIG.mockData.currentLocation.lat, 
                    lng: CONFIG.mockData.currentLocation.lng 
                },
                map: this.map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: '#007AFF',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 3
                },
                zIndex: 1
            });
            
            // Get the HTML marker for floating pickup selection
            const locationMarker = document.getElementById('pickup-marker');
            
            // Float marker when map drag starts
            this.map.addListener('dragstart', () => {
                if (locationMarker) {
                    locationMarker.classList.add('floating');
                    locationMarker.classList.remove('dropping');
                }
            });
            
            // Drop marker when map drag ends
            this.map.addListener('dragend', () => {
                if (locationMarker) {
                    locationMarker.classList.remove('floating');
                    locationMarker.classList.add('dropping');
                    
                    // Remove dropping class after animation
                    setTimeout(() => {
                        locationMarker.classList.remove('dropping');
                    }, 300);
                }
                
                // Update address based on new center
                const center = this.map.getCenter();
                this.updatePickupAddress(center.lat(), center.lng());
            });
        } catch (error) {
            console.error('Failed to initialize Google Maps:', error);
            // Show fallback UI
            mapElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6c7380;flex-direction:column;padding:20px;text-align:center;"><div style="font-size:48px;margin-bottom:12px;">📍</div><div>Map unavailable</div></div>';
        }
    }

    /**
     * Update pickup address based on map center coordinates
     */
    async updatePickupAddress(lat, lng) {
        const addressElement = document.querySelector('.origin-row .location-address');
        if (!addressElement) return;
        
        // Show loading state
        addressElement.textContent = 'Finding address...';
        
        try {
            // Use Google Geocoder to get address from coordinates
            if (window.google && window.google.maps) {
                const geocoder = new google.maps.Geocoder();
                const response = await geocoder.geocode({ location: { lat, lng } });
                
                if (response.results && response.results[0]) {
                    const address = response.results[0].formatted_address;
                    // Get short version (street address)
                    const shortAddress = address.split(',')[0];
                    addressElement.textContent = shortAddress;
                    
                    // Update the stored current location
                    CONFIG.mockData.currentLocation.lat = lat;
                    CONFIG.mockData.currentLocation.lng = lng;
                    CONFIG.mockData.currentLocation.address = shortAddress;
                } else {
                    addressElement.textContent = 'Unknown location';
                }
            }
        } catch (error) {
            console.error('Geocoding failed:', error);
            addressElement.textContent = 'Location selected';
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Agent banner click
        document.getElementById('agent-banner').addEventListener('click', () => {
            this.navigateToScreen('agent-voice');
        });

        // Back buttons
        document.getElementById('back-to-home').addEventListener('click', () => {
            this.navigateToScreen('home');
            this.aiAgent.reset();
        });

        document.getElementById('back-from-chat').addEventListener('click', () => {
            this.navigateToScreen('agent-voice');
            this.aiAgent.reset();
            this.clearChatHistory();
        });

        // Voice input area - tap and hold to record
        const voiceInputArea = document.getElementById('voice-input-area');
        
        voiceInputArea.addEventListener('mousedown', (e) => {
            // Don't start recording if clicking on chips, input, or buttons
            if (e.target.closest('.quick-action-chip') || 
                e.target.closest('.agent-input-row') ||
                e.target.closest('.agent-footer')) return;
            
            // Get tap position relative to the voice input area
            const rect = voiceInputArea.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.startRecordingWithFeedback(x, y);
        });

        voiceInputArea.addEventListener('mouseup', () => {
            this.stopRecordingWithFeedback();
        });

        voiceInputArea.addEventListener('touchstart', (e) => {
            // Don't start recording if touching chips, input, or buttons
            if (e.target.closest('.quick-action-chip') || 
                e.target.closest('.agent-input-row') ||
                e.target.closest('.agent-footer')) return;
            e.preventDefault();
            
            // Get tap position relative to the voice input area
            const rect = voiceInputArea.getBoundingClientRect();
            const touch = e.touches[0];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            this.startRecordingWithFeedback(x, y);
        });

        voiceInputArea.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecordingWithFeedback();
        });

        // Quick action chips
        this.setupQuickActionChips();

        // Mic button in footer
        const micBtn = document.getElementById('mic-btn');
        if (micBtn) {
            micBtn.addEventListener('click', () => {
                this.toggleVoiceRecording();
            });
        }

        // Update greeting based on time of day
        this.updateGreeting();

        // Text input (Voice screen) - Enter to send
        const textInput = document.getElementById('text-input');
        const agentSendBtn = document.getElementById('agent-send-btn');
        // micBtn already declared above
        
        if (textInput) {
            // Show/hide send button and toggle mic button style based on input
            textInput.addEventListener('input', () => {
                const hasText = textInput.value.trim();
                if (agentSendBtn) {
                    if (hasText) {
                        agentSendBtn.classList.add('visible');
                    } else {
                        agentSendBtn.classList.remove('visible');
                    }
                }
                // Toggle mic button to secondary (white) style when typing
                if (micBtn) {
                    if (hasText) {
                        micBtn.classList.add('secondary');
                    } else {
                        micBtn.classList.remove('secondary');
                    }
                }
            });
            
            textInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const message = textInput.value.trim();
                    if (message) {
                        this.handleUserMessage(message);
                        textInput.value = '';
                        // Hide send button and reset mic button after sending
                        if (agentSendBtn) {
                            agentSendBtn.classList.remove('visible');
                        }
                        if (micBtn) {
                            micBtn.classList.remove('secondary');
                        }
                    }
                }
            });
        }
        
        // Send button click (Voice screen)
        if (agentSendBtn) {
            agentSendBtn.addEventListener('click', () => {
                const message = textInput.value.trim();
                if (message) {
                    this.handleUserMessage(message);
                    textInput.value = '';
                    agentSendBtn.classList.remove('visible');
                    if (micBtn) {
                        micBtn.classList.remove('secondary');
                    }
                }
            });
        }

        // Text input and send button (Chat screen)
        const textInputChat = document.getElementById('text-input-chat');
        const sendBtnChat = document.getElementById('send-btn-chat');
        const voiceBtnChat = document.getElementById('voice-btn-chat');

        sendBtnChat.addEventListener('click', () => {
            const message = textInputChat.value.trim();
            if (message) {
                this.handleUserMessage(message);
                textInputChat.value = '';
            }
        });

        textInputChat.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const message = textInputChat.value.trim();
                if (message) {
                    this.handleUserMessage(message);
                    textInputChat.value = '';
                }
            }
        });

        // Voice button in chat - tap to start/stop recording
        if (voiceBtnChat) {
            voiceBtnChat.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleChatVoiceRecording();
            });
        }

        // Modal close
        document.getElementById('modal-close').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('trip-modal').addEventListener('click', (e) => {
            if (e.target.id === 'trip-modal') {
                this.closeModal();
            }
        });
    }

    /**
     * Initialize speech recognition
     */
    initializeSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.warn('Speech recognition not supported');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true; // Changed to continuous mode for better reliability
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        
        // Load permission state from localStorage
        this.microphonePermissionGranted = localStorage.getItem('micPermissionGranted') === 'true';
        this.microphonePermissionDenied = localStorage.getItem('micPermissionDenied') === 'true';
        
        console.log('Speech recognition initialized. Permission granted:', this.microphonePermissionGranted, 'Permission denied:', this.microphonePermissionDenied);
        
        // Pre-request microphone permission to avoid repeated prompts
        this.preRequestMicrophonePermission();

        this.recognition.onstart = () => {
            console.log('[Voice] Speech recognition started successfully');
            console.log('[Voice] Recording context:', this.recordingContext);
            
            // Mark recognition as ready after a short delay to ensure audio processing has begun
            setTimeout(() => {
                this.recognitionReady = true;
                console.log('[Voice] Recognition ready to capture audio');
            }, 300); // 300ms delay to ensure audio pipeline is ready
        };
        
        this.recognition.onaudiostart = () => {
            console.log('[Voice] Audio capturing started - microphone is receiving input');
        };
        
        this.recognition.onspeechstart = () => {
            console.log('[Voice] Speech detected - user is speaking');
        };
        
        this.recognition.onspeechend = () => {
            console.log('[Voice] Speech ended - user stopped speaking');
        };

        this.recognition.onresult = (event) => {
            console.log('[Voice] Speech recognition result received, results count:', event.results.length);
            
            // Mark permission as granted on first successful result
            if (!this.microphonePermissionGranted) {
                this.microphonePermissionGranted = true;
                localStorage.setItem('micPermissionGranted', 'true');
                localStorage.removeItem('micPermissionDenied');
                this.microphonePermissionDenied = false;
                console.log('[Voice] Permission granted and saved');
            }
            
            // Capture transcript (accumulate all results)
            this.currentTranscript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            
            const isFinal = event.results[event.results.length - 1].isFinal;
            console.log('[Voice] Transcript:', this.currentTranscript, 'Context:', this.recordingContext, 'isFinal:', isFinal);
            
            // Store the current context
            const currentContext = this.recordingContext;
            
            // Update UI based on recording context (show interim results)
            if (currentContext === 'voice-screen') {
                const transcriptElement = document.getElementById('voice-transcript');
                console.log('[Voice] Updating voice-screen transcript element:', !!transcriptElement);
                if (transcriptElement) {
                    transcriptElement.textContent = this.currentTranscript;
                }
            } else if (currentContext === 'chat-screen') {
                const textInputChat = document.getElementById('text-input-chat');
                console.log('[Voice] Updating chat-screen text input:', !!textInputChat, 'value:', this.currentTranscript);
                if (textInputChat) {
                    textInputChat.value = this.currentTranscript;
                }
            } else {
                console.log('[Voice] WARNING: Unknown recording context:', currentContext);
            }

            // Mark that we got a final result and stop recognition immediately
            if (isFinal) {
                console.log('Got final result, marking flag and force stopping recognition');
                this.gotFinalResult = true;
                
                // Force stop recognition after getting final result
                if (this.recordingContext === 'voice-screen') {
                    this.forceStopRecording();
                } else if (this.recordingContext === 'chat-screen') {
                    this.forceStopRecordingInChat();
                }
            }
        };

        this.recognition.onerror = (event) => {
            console.error('[Voice] Speech recognition error:', event.error, 'message:', event.message, 'full event:', event);
            
            const currentContext = this.recordingContext;
            
            // Handle permission denial
            if (event.error === 'not-allowed' || event.error === 'permission-denied') {
                this.microphonePermissionDenied = true;
                localStorage.setItem('micPermissionDenied', 'true');
                localStorage.removeItem('micPermissionGranted');
                
                if (currentContext === 'voice-screen') {
                    const transcriptElement = document.getElementById('voice-transcript');
                    if (transcriptElement) {
                        transcriptElement.textContent = 'Microphone access denied. Please enable in browser settings.';
                    }
                } else if (currentContext === 'chat-screen') {
                    const textInputChat = document.getElementById('text-input-chat');
                    if (textInputChat) {
                        textInputChat.placeholder = 'Microphone denied. Use text input.';
                        setTimeout(() => {
                            textInputChat.placeholder = 'Type a message...';
                        }, 3000);
                    }
                }
                
                // Clear state for permission errors
                this.isRecording = false;
                this.recordingContext = null;
                this.currentTranscript = '';
                this.gotFinalResult = false;
                this.recordingStartTime = null;
                this.recognitionReady = false;
            }
            
            // Handle no-speech error (user didn't say anything)
            if (event.error === 'no-speech') {
                console.log('No speech detected, will let onend clean up');
                // Let onend handle cleanup
                return;
            }
            
            // For other errors, let onend handle cleanup
            console.log('Other error, will let onend handle cleanup');
        };

        this.recognition.onend = () => {
            console.log('Speech recognition ended');
            console.log('State - gotFinalResult:', this.gotFinalResult, 'transcript:', this.currentTranscript, 'context:', this.recordingContext);
            
            // Clear auto-stop timer if still running
            if (this.autoStopTimer) {
                clearTimeout(this.autoStopTimer);
                this.autoStopTimer = null;
            }
            
            const currentContext = this.recordingContext;
            const transcript = this.currentTranscript;
            const hadFinalResult = this.gotFinalResult;
            
            // Clean up UI
            if (currentContext === 'voice-screen') {
                // Hide voice feedback
                const voiceFeedback = document.getElementById('voice-feedback');
                if (voiceFeedback) {
                    voiceFeedback.classList.remove('active');
                }
                
                // Hide recording overlay
                const recordingOverlay = document.getElementById('recording-overlay');
                if (recordingOverlay) {
                    recordingOverlay.classList.remove('active');
                }
                
                // Show instruction text again
                const voiceInstruction = document.querySelector('.agent-footer .voice-instruction');
                if (voiceInstruction) {
                    voiceInstruction.classList.remove('hidden');
                }
                
                const micBtn = document.getElementById('mic-btn');
                if (micBtn) {
                    micBtn.classList.remove('recording');
                }
            } else if (currentContext === 'chat-screen') {
                const voiceBtn = document.getElementById('voice-btn-chat');
                const textInputChat = document.getElementById('text-input-chat');
                
                if (voiceBtn) {
                    voiceBtn.classList.remove('recording');
                }
                
                // Reset placeholder if no text was entered
                if (textInputChat && !textInputChat.value.trim()) {
                    textInputChat.placeholder = 'Type a message...';
                }
            }
            
            // Clear recording state
            this.isRecording = false;
            this.recordingContext = null;
            this.currentTranscript = '';
            this.gotFinalResult = false;
            this.recordingStartTime = null;
            this.recognitionReady = false;
            this.recordingFromMicButton = false;
            
            console.log('Recording state cleared');
            
            // Process the message if we got a transcript
            if (transcript && transcript.trim() && hadFinalResult) {
                console.log('Processing message with transcript:', transcript);
                this.handleUserMessage(transcript);
                
                // Clear text input after voice command
                const textInputChat = document.getElementById('text-input-chat');
                if (textInputChat) {
                    textInputChat.value = '';
                }
            } else {
                console.log('No valid transcript to process');
            }
        };
        
    }

    /**
     * Pre-request microphone permission using getUserMedia
     * This ensures the browser only prompts once per session
     */
    async preRequestMicrophonePermission() {
        // Check if we already have permission using the Permissions API
        if (navigator.permissions) {
            try {
                const result = await navigator.permissions.query({ name: 'microphone' });
                console.log('Microphone permission status:', result.state);
                
                // Listen for permission state changes
                result.onchange = () => {
                    console.log('Microphone permission state changed to:', result.state);
                    if (result.state === 'granted') {
                        this.microphonePermissionGranted = true;
                        this.microphonePermissionDenied = false;
                        localStorage.setItem('micPermissionGranted', 'true');
                        localStorage.removeItem('micPermissionDenied');
                    } else if (result.state === 'denied') {
                        this.microphonePermissionGranted = false;
                        this.microphonePermissionDenied = true;
                        localStorage.setItem('micPermissionDenied', 'true');
                        localStorage.removeItem('micPermissionGranted');
                    }
                };
                
                if (result.state === 'granted') {
                    this.microphonePermissionGranted = true;
                    this.microphonePermissionDenied = false;
                    localStorage.setItem('micPermissionGranted', 'true');
                    localStorage.removeItem('micPermissionDenied');
                    console.log('Microphone permission already granted');
                    return;
                }
                
                if (result.state === 'denied') {
                    this.microphonePermissionDenied = true;
                    this.microphonePermissionGranted = false;
                    localStorage.setItem('micPermissionDenied', 'true');
                    localStorage.removeItem('micPermissionGranted');
                    console.log('Microphone permission denied');
                    return;
                }
                
                // If 'prompt', check localStorage - if we had permission before, 
                // try a silent getUserMedia to restore it
                if (localStorage.getItem('micPermissionGranted') === 'true' && 
                    navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    console.log('Permission state is prompt but localStorage says granted - trying silent refresh');
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        stream.getTracks().forEach(track => track.stop());
                        this.microphonePermissionGranted = true;
                        this.microphonePermissionDenied = false;
                        console.log('Microphone permission silently refreshed');
                        return;
                    } catch (e) {
                        console.log('Silent refresh failed:', e.name);
                        // Don't clear localStorage yet - let user try manually
                    }
                }
            } catch (e) {
                console.log('Permissions API not fully supported:', e);
            }
        }
        
        // Fallback for browsers without Permissions API
        // If localStorage says we had permission, try to acquire it silently
        if (localStorage.getItem('micPermissionGranted') === 'true' && 
            navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                this.microphonePermissionGranted = true;
                this.microphonePermissionDenied = false;
                console.log('Microphone permission refreshed via fallback');
            } catch (e) {
                console.log('Could not refresh microphone permission:', e.name);
                if (e.name === 'NotAllowedError') {
                    this.microphonePermissionGranted = false;
                    this.microphonePermissionDenied = true;
                    localStorage.setItem('micPermissionDenied', 'true');
                    localStorage.removeItem('micPermissionGranted');
                }
            }
        }
    }

    /**
     * Request microphone permission explicitly (called on first voice button click)
     */
    async requestMicrophonePermission() {
        if (this.microphonePermissionGranted) {
            return true;
        }
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('getUserMedia not supported');
            return false;
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Stop the stream immediately - we just needed the permission
            stream.getTracks().forEach(track => track.stop());
            
            this.microphonePermissionGranted = true;
            this.microphonePermissionDenied = false;
            localStorage.setItem('micPermissionGranted', 'true');
            localStorage.removeItem('micPermissionDenied');
            console.log('Microphone permission granted via getUserMedia');
            return true;
        } catch (e) {
            console.error('Microphone permission denied:', e);
            this.microphonePermissionDenied = true;
            localStorage.setItem('micPermissionDenied', 'true');
            localStorage.removeItem('micPermissionGranted');
            return false;
        }
    }

    /**
     * Start recording
     */
    async startRecording() {
        console.log('startRecording called, current state - isRecording:', this.isRecording, 'context:', this.recordingContext);
        
        if (!this.recognition) {
            console.error('Recognition not initialized');
            return;
        }
        
        // Request microphone permission first (this ensures browser remembers for session)
        if (!this.microphonePermissionGranted) {
            console.log('Requesting microphone permission...');
            const hasPermission = await this.requestMicrophonePermission();
            if (!hasPermission) {
                console.log('Microphone permission denied');
                const transcriptElement = document.getElementById('voice-transcript');
                if (transcriptElement) {
                    transcriptElement.textContent = 'Microphone access denied. Please allow microphone access in your browser settings.';
                }
                return;
            }
        }
        
        console.log('Permission state - granted:', this.microphonePermissionGranted, 'denied:', this.microphonePermissionDenied);
        
        // Force stop any existing recognition first
        if (this.isRecording || this.recordingContext) {
            console.log('Already recording! Aborting existing session first');
            try {
                this.recognition.abort(); // Use abort instead of stop for immediate termination
            } catch (e) {
                console.log('Error aborting existing recognition:', e);
            }
            
            // Clear auto-stop timer and reset state
            if (this.autoStopTimer) {
                clearTimeout(this.autoStopTimer);
                this.autoStopTimer = null;
            }
            this.isRecording = false;
            this.recordingContext = null;
            
            // Wait a bit for abort to complete, then restart
            setTimeout(() => {
                this.startRecording();
            }, 200);
            return;
        }

        // Reset all state for new recording
        this.recordingContext = 'voice-screen';
        this.isRecording = true;
        this.currentTranscript = '';
        this.gotFinalResult = false;
        this.recognitionReady = false;
        
        const voiceFeedback = document.getElementById('voice-feedback');
        const transcriptElement = document.getElementById('voice-transcript');
        const micBtn = document.getElementById('mic-btn');
        
        // Show voice feedback indicator only for screen tap (not mic button)
        if (voiceFeedback && !this.recordingFromMicButton) {
            voiceFeedback.classList.add('active');
        }
        
        // Add recording state to mic button only when recording from mic button
        if (micBtn && this.recordingFromMicButton) {
            micBtn.classList.add('recording');
        }
        
        if (transcriptElement) {
            transcriptElement.textContent = '';
        }

        console.log('Starting speech recognition...');
        
        try {
            this.recordingStartTime = Date.now(); // Track start time
            this.recognition.start();
            console.log('Recognition start called at', this.recordingStartTime);
            
            // Auto-stop after recordingDuration
            this.autoStopTimer = setTimeout(() => {
                console.log('Auto-stopping recording after', this.recordingDuration, 'ms');
                if (this.isRecording) {
                    this.forceStopRecording();
                }
            }, this.recordingDuration);
        } catch (e) {
            console.error('Failed to start recognition:', e);
            
            this.isRecording = false;
            this.recordingContext = null;
            this.currentTranscript = '';
            this.gotFinalResult = false;
            this.recordingStartTime = null;
            this.recognitionReady = false;
            
            // Hide voice feedback
            if (voiceFeedback) {
                voiceFeedback.classList.remove('active');
            }
            
            if (micBtn) {
                micBtn.classList.remove('recording');
            }
            
            if (transcriptElement) {
                transcriptElement.textContent = 'Voice input error. Please refresh and try again.';
            }
        }
    }

    /**
     * Stop recording (called when user releases button)
     * Note: Recording will continue until auto-stop timer completes
     */
    stopRecording() {
        console.log('stopRecording called (user released button)');
        
        if (!this.isRecording) return;
        
        const elapsed = Date.now() - (this.recordingStartTime || 0);
        console.log('User released after', elapsed, 'ms. Recording will continue until completion.');
        
        // Visual feedback that recording is still active
        const transcriptElement = document.getElementById('voice-transcript');
        if (transcriptElement && transcriptElement.textContent === 'Listening... (speak now)') {
            transcriptElement.textContent = 'Processing...';
        }
        
        // Note: We don't actually stop recognition here
        // The auto-stop timer will handle it
    }
    
    /**
     * Force stop recording (called by auto-stop timer or when getting final result)
     */
    forceStopRecording() {
        console.log('forceStopRecording called');
        
        if (!this.recognition || !this.isRecording) return;
        
        // Clear auto-stop timer
        if (this.autoStopTimer) {
            clearTimeout(this.autoStopTimer);
            this.autoStopTimer = null;
        }
        
        // Stop the recognition
        try {
            this.recognition.stop();
            console.log('Recognition forcefully stopped');
        } catch (e) {
            console.error('Failed to stop recognition:', e);
            // Clean up on error
            this.isRecording = false;
            this.recordingContext = null;
            this.recordingStartTime = null;
            this.recognitionReady = false;
            this.recordingFromMicButton = false;
            
            // Hide voice feedback
            const voiceFeedback = document.getElementById('voice-feedback');
            if (voiceFeedback) {
                voiceFeedback.classList.remove('active');
            }
            
            // Hide recording overlay
            const recordingOverlay = document.getElementById('recording-overlay');
            if (recordingOverlay) {
                recordingOverlay.classList.remove('active');
            }
            
            // Show instruction text again
            const voiceInstruction = document.querySelector('.agent-footer .voice-instruction');
            if (voiceInstruction) {
                voiceInstruction.classList.remove('hidden');
            }
            
            const micBtn = document.getElementById('mic-btn');
            if (micBtn) {
                micBtn.classList.remove('recording');
            }
        }
    }

    /**
     * Play a quick audio indication for recording start
     */
    playRecordingStartSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Quick, subtle beep
            oscillator.frequency.value = 880; // A5 note
            oscillator.type = 'sine';
            
            // Quick fade in and out
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.02);
            gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (e) {
            console.log('Could not play recording start sound:', e);
        }
    }

    /**
     * Start recording with visual feedback (for tap-and-hold on welcome screen)
     * @param {number} x - X coordinate for feedback position (optional)
     * @param {number} y - Y coordinate for feedback position (optional)
     * @param {boolean} fromMicButton - Whether recording was started from mic button
     */
    async startRecordingWithFeedback(x, y, fromMicButton = false) {
        // Track recording source
        this.recordingFromMicButton = fromMicButton;
        
        const voiceFeedback = document.getElementById('voice-feedback');
        const recordingOverlay = document.getElementById('recording-overlay');
        const voiceInstruction = document.querySelector('.agent-footer .voice-instruction');
        
        // Only show tap feedback for screen tap (not mic button)
        if (!fromMicButton) {
            // Play quick audio indication
            this.playRecordingStartSound();
            
            // Position feedback at tap location
            if (voiceFeedback && x !== undefined && y !== undefined) {
                voiceFeedback.style.left = `${x}px`;
                voiceFeedback.style.top = `${y}px`;
            }
            
            // Show overlay
            if (recordingOverlay) {
                recordingOverlay.classList.add('active');
            }
            
            // Hide the instruction text
            if (voiceInstruction) {
                voiceInstruction.classList.add('hidden');
            }
        }
        
        // Start actual recording (this will show the voice feedback for screen tap)
        await this.startRecording();
    }

    /**
     * Stop recording with visual feedback
     */
    stopRecordingWithFeedback() {
        // Hide overlay and show instruction text
        const recordingOverlay = document.getElementById('recording-overlay');
        const voiceInstruction = document.querySelector('.agent-footer .voice-instruction');
        const voiceFeedback = document.getElementById('voice-feedback');
        
        if (recordingOverlay) {
            recordingOverlay.classList.remove('active');
        }
        
        if (voiceInstruction) {
            voiceInstruction.classList.remove('hidden');
        }
        
        // Hide voice feedback immediately when releasing
        if (voiceFeedback) {
            voiceFeedback.classList.remove('active');
        }
        
        // Clear mic button recording class
        this.recordingFromMicButton = false;
        
        // Stop actual recording
        this.stopRecording();
    }

    /**
     * Toggle voice recording (for mic button)
     */
    toggleVoiceRecording() {
        if (this.isRecording) {
            this.stopRecordingWithFeedback();
        } else {
            // For mic button, pass fromMicButton = true
            this.startRecordingWithFeedback(undefined, undefined, true);
        }
    }

    /**
     * Update greeting based on time of day
     */
    updateGreeting() {
        const greetingLine = document.getElementById('greeting-line');
        if (!greetingLine) return;
        
        const hour = new Date().getHours();
        let greeting = 'Hello';
        
        if (hour >= 5 && hour < 12) {
            greeting = 'Good morning';
        } else if (hour >= 12 && hour < 17) {
            greeting = 'Good afternoon';
        } else if (hour >= 17 && hour < 21) {
            greeting = 'Good evening';
        } else {
            greeting = 'Good night';
        }
        
        // Use a default name or could be made dynamic
        greetingLine.textContent = `${greeting}, Ran`;
    }

    /**
     * Set up quick action chip handlers
     */
    setupQuickActionChips() {
        const chips = document.querySelectorAll('.quick-action-chip');
        
        chips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering voice recording
                const action = chip.dataset.action;
                this.handleQuickAction(action);
            });
        });
    }

    /**
     * Handle quick action chip clicks
     */
    async handleQuickAction(action) {
        // Navigate to chat screen first
        this.navigateToScreen('agent-chat');
        
        // Add a small delay for screen transition
        await this.delay(100);
        
        switch (action) {
            case 'book-home':
                await this.handleBookHomeAction();
                break;
            case 'book-work':
                await this.handleBookWorkAction();
                break;
            case 'book-recent':
                await this.handleBookRecentAction();
                break;
            case 'schedule-ride':
                await this.handleScheduleRideAction();
                break;
            case 'view-upcoming':
                await this.handleViewUpcomingAction();
                break;
            case 'service-info':
                await this.handleServiceInfoAction();
                break;
            case 'points-of-interest':
                await this.handlePointsOfInterestAction();
                break;
            default:
                console.log('Unknown quick action:', action);
        }
    }

    /**
     * Handle "Book a ride home" quick action
     */
    async handleBookHomeAction() {
        const home = CONFIG.mockData.savedPlaces.home;
        const userMessage = `Book a ride home`;
        
        // Show user message
        this.addMessageToChat('user', userMessage);
        
        // Process with AI agent (it will use the saved home address)
        const response = await this.aiAgent.processQuickAction('book-home', {
            destination: home
        });
        
        this.handleQuickActionResponse(response);
    }

    /**
     * Handle "Book a ride to work" quick action
     */
    async handleBookWorkAction() {
        const work = CONFIG.mockData.savedPlaces.work;
        const userMessage = `Book a ride to work`;
        
        // Show user message
        this.addMessageToChat('user', userMessage);
        
        // Process with AI agent
        const response = await this.aiAgent.processQuickAction('book-work', {
            destination: work
        });
        
        this.handleQuickActionResponse(response);
    }

    /**
     * Handle "Book a recent ride" quick action
     */
    async handleBookRecentAction() {
        const userMessage = `Book a recent ride`;
        
        // Show user message
        this.addMessageToChat('user', userMessage);
        
        // Process with AI agent
        const response = await this.aiAgent.processQuickAction('book-recent', {});
        
        this.handleQuickActionResponse(response);
    }

    /**
     * Handle "Schedule a ride" quick action
     */
    async handleScheduleRideAction() {
        const userMessage = `Schedule a ride`;
        
        // Show user message
        this.addMessageToChat('user', userMessage);
        
        // Process with AI agent
        const response = await this.aiAgent.processQuickAction('schedule-ride', {});
        
        this.handleQuickActionResponse(response);
    }

    /**
     * Handle "View upcoming rides" quick action
     */
    async handleViewUpcomingAction() {
        const userMessage = `View my upcoming rides`;
        
        // Show user message
        this.addMessageToChat('user', userMessage);
        
        // Process with AI agent
        const response = await this.aiAgent.processQuickAction('view-upcoming', {});
        
        this.handleQuickActionResponse(response);
    }

    /**
     * Handle "Service info" quick action
     */
    async handleServiceInfoAction() {
        const userMessage = `Tell me about the service`;
        
        // Show user message
        this.addMessageToChat('user', userMessage);
        
        // Process with AI agent
        const response = await this.aiAgent.processQuickAction('service-info', {});
        
        this.handleQuickActionResponse(response);
    }

    /**
     * Handle "Points of interest" quick action
     */
    async handlePointsOfInterestAction() {
        const userMessage = `Show me points of interest in Arlington`;
        
        // Show user message
        this.addMessageToChat('user', userMessage);
        
        // Show loading indicator for 2-3 seconds (simulating API call)
        this.showTypingIndicator('poi');
        await this.delay(2500);
        this.removeTypingIndicator();
        
        // Points of interest data - transportation hubs and central locations
        const pointsOfInterest = [
            {
                id: 'centreport-tre',
                name: 'CentrePort/DFW Airport Station',
                description: 'Trinity Railway Express - nearest rail station',
                address: '201 W Airfield Dr, DFW Airport, TX 75261',
                lat: 32.8968,
                lng: -97.0430
            },
            {
                id: 'downtown-arlington',
                name: 'Downtown Arlington',
                description: 'Central business district',
                address: '101 W Abram St, Arlington, TX 76010',
                lat: 32.7357,
                lng: -97.1081
            },
            {
                id: 'uta',
                name: 'UT Arlington',
                description: 'University campus - central hub',
                address: '701 S Nedderman Dr, Arlington, TX 76019',
                lat: 32.7299,
                lng: -97.1131
            },
            {
                id: 'parks-mall',
                name: 'The Parks Mall',
                description: 'Major shopping center',
                address: '3811 S Cooper St, Arlington, TX 76015',
                lat: 32.6858,
                lng: -97.1048
            },
            {
                id: 'arlington-highlands',
                name: 'Arlington Highlands',
                description: 'Shopping and dining district',
                address: '4000 Five Points Blvd, Arlington, TX 76018',
                lat: 32.6707,
                lng: -97.0858
            },
            {
                id: 'medical-center',
                name: 'Medical Center of Arlington',
                description: 'Regional medical center',
                address: '3301 Matlock Rd, Arlington, TX 76015',
                lat: 32.6872,
                lng: -97.0933
            },
            {
                id: 'entertainment-district',
                name: 'Entertainment District',
                description: 'AT&T Stadium & Globe Life Field area',
                address: '1650 E Randol Mill Rd, Arlington, TX 76011',
                lat: 32.7505,
                lng: -97.0828
            },
            {
                id: 'lincoln-square',
                name: 'Lincoln Square',
                description: 'North Arlington shopping center',
                address: '301 Lincoln Square, Arlington, TX 76011',
                lat: 32.7621,
                lng: -97.1082
            }
        ];
        
        // Show AI response
        this.addMessageToChat('ai', 'Here are some popular points of interest in Arlington. Tap "Book ride" to get a ride to any of these locations:');
        this.aiAgent.speak('Here are some popular points of interest in Arlington.');
        
        // Render the POI widget
        this.renderPointsOfInterestWidget(pointsOfInterest);
    }

    /**
     * Render points of interest widget in chat
     */
    renderPointsOfInterestWidget(pointsOfInterest) {
        const container = document.getElementById('chat-container');
        
        const widget = document.createElement('div');
        widget.className = 'poi-widget';
        widget.innerHTML = `
            <div class="poi-list">
                ${pointsOfInterest.map(poi => `
                    <div class="poi-item" data-poi-id="${poi.id}">
                        <div class="poi-info">
                            <div class="poi-name">${poi.name}</div>
                            <div class="poi-description">${poi.description}</div>
                        </div>
                        <button class="poi-book-btn" data-poi-id="${poi.id}">Book ride</button>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.appendChild(widget);
        
        // Store POI data for booking
        this.pointsOfInterest = pointsOfInterest;
        
        // Add click handlers for book buttons
        widget.querySelectorAll('.poi-book-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const poiId = e.target.dataset.poiId;
                const poi = pointsOfInterest.find(p => p.id === poiId);
                if (poi) {
                    this.bookRideToPOI(poi);
                }
            });
        });
        
        this.scrollToBottom();
    }

    /**
     * Book a ride to a point of interest
     */
    async bookRideToPOI(poi) {
        this.addMessageToChat('user', `Book a ride to ${poi.name}`);
        
        // Set booking context
        this.aiAgent.bookingContext.origin = CONFIG.mockData.currentLocation;
        this.aiAgent.bookingContext.destination = {
            name: poi.name,
            address: poi.address,
            lat: poi.lat,
            lng: poi.lng
        };
        this.aiAgent.bookingContext.datetime = 'now';
        
        // Show typing indicator
        this.showTypingIndicator('proposals');
        
        try {
            const proposals = await this.bookingService.generateProposals(
                this.aiAgent.bookingContext.origin,
                this.aiAgent.bookingContext.destination,
                'now',
                this.aiAgent.bookingContext.passengers
            );
            
            this.removeTypingIndicator();
            
            this.aiAgent.currentProposals = proposals;
            this.currentProposals = proposals;
            
            this.addMessageToChat('ai', `Here are your ride options to ${poi.name}:`);
            this.addProposalsToChat(proposals, 'now');
            
            // Start TTS for proposals
            if (CONFIG.features.textToSpeech && CONFIG.features.autoScrollCarousel) {
                await this.startProposalPresentation(proposals);
            }
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessageToChat('ai', `Sorry, I couldn't find ride options to ${poi.name}. Please try again.`);
        }
    }

    /**
     * Handle quick action responses
     */
    async handleQuickActionResponse(response) {
        // Handle proposals (for book home/work) - same as regular proposals
        if (response.proposals) {
            this.addMessageToChat('ai', response.text);
            this.currentProposals = response.proposals;
            this.aiAgent.currentProposals = response.proposals;
            this.aiAgent.currentState = 'PRESENTING_OPTIONS';
            this.addProposalsToChat(response.proposals, 'now');
            
            // Start TTS and auto-scroll if enabled (read all proposals)
            if (CONFIG.features.textToSpeech && CONFIG.features.autoScrollCarousel) {
                await this.startProposalPresentation(response.proposals);
            }
            return;
        }

        // Handle recent rides
        if (response.recentRides) {
            this.addMessageToChat('ai', response.text);
            this.aiAgent.speak(response.text);
            this.renderRecentRidesWidget(response.recentRides);
            return;
        }

        // Handle upcoming rides
        if (response.upcomingRides) {
            this.addMessageToChat('ai', response.text);
            this.aiAgent.speak(response.text);
            this.renderUpcomingRidesWidget(response.upcomingRides, response.showViewAllLink);
            return;
        }

        // Handle service info
        if (response.serviceInfo) {
            this.addMessageToChat('ai', response.text);
            this.aiAgent.speak(this.stripMarkdown(response.text));
            return;
        }

        // Handle schedule ride action
        if (response.action === 'open-scheduler') {
            this.addMessageToChat('ai', response.text);
            this.aiAgent.speak(response.text);
            // Open scheduler modal after a short delay
            setTimeout(() => {
                this.schedulingModal.open();
            }, 500);
            return;
        }

        // Default: just show message
        this.addMessageToChat('ai', response.text);
        if (response.speak) {
            this.aiAgent.speak(response.text);
        }
    }

    /**
     * Strip markdown formatting for TTS
     */
    stripMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '$1')  // Bold
            .replace(/\*(.*?)\*/g, '$1')       // Italic
            .replace(/•/g, '')                  // Bullets
            .replace(/\n+/g, '. ')             // Newlines to periods
            .trim();
    }

    /**
     * Render recent rides widget in chat
     */
    renderRecentRidesWidget(recentRides) {
        const container = document.getElementById('chat-container');
        
        const widget = document.createElement('div');
        widget.className = 'recent-rides-widget';
        widget.innerHTML = `
            <div class="rides-list">
                ${recentRides.map((ride, index) => `
                    <div class="ride-item" data-ride-index="${index}">
                        <div class="ride-route">
                            <div class="ride-locations">
                                <span class="ride-origin">${ride.origin.name || ride.origin.address}</span>
                                <span class="ride-arrow">→</span>
                                <span class="ride-dest">${ride.destination.name || ride.destination.address}</span>
                            </div>
                            <div class="ride-meta">
                                <span class="ride-date">${ride.date}</span>
                                <span class="ride-price">${ride.price}</span>
                            </div>
                        </div>
                        <button class="rebook-btn" data-ride-id="${ride.id}">Book again</button>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.appendChild(widget);
        
        // Add click handlers for rebook buttons
        widget.querySelectorAll('.rebook-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const rideId = e.target.dataset.rideId;
                const ride = recentRides.find(r => r.id === rideId);
                if (ride) {
                    this.rebookRide(ride);
                }
            });
        });
        
        this.scrollToBottom();
    }

    /**
     * Rebook a recent ride
     */
    async rebookRide(ride) {
        this.addMessageToChat('user', `Book again: ${ride.origin.name || 'Origin'} to ${ride.destination.name || 'Destination'}`);
        
        // Set booking context
        this.aiAgent.bookingContext.origin = ride.origin;
        this.aiAgent.bookingContext.destination = ride.destination;
        this.aiAgent.bookingContext.datetime = 'now';
        
        // Show typing indicator
        this.showTypingIndicator('proposals');
        
        try {
            const proposals = await this.bookingService.generateProposals(
                ride.origin,
                ride.destination,
                'now',
                this.aiAgent.bookingContext.passengers
            );
            
            this.removeTypingIndicator();
            
            this.aiAgent.currentProposals = proposals;
            this.currentProposals = proposals;
            
            this.addMessageToChat('ai', `Here are your ride options:`);
            this.addProposalsToChat(proposals, 'now');
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessageToChat('ai', 'Sorry, I couldn\'t find ride options for this route. Please try again.');
        }
    }

    /**
     * Render upcoming rides widget in chat
     */
    renderUpcomingRidesWidget(upcomingRides, showViewAllLink) {
        const container = document.getElementById('chat-container');
        
        const widget = document.createElement('div');
        widget.className = 'upcoming-rides-widget';
        widget.innerHTML = `
            <div class="rides-list">
                ${upcomingRides.map(ride => `
                    <div class="upcoming-ride-item">
                        <div class="upcoming-ride-header">
                            <div class="ride-status-badge ${ride.status}">${ride.status === 'scheduled' ? 'Pending' : ride.status}</div>
                            <div class="ride-locations">
                                <span class="ride-origin">${ride.origin.name || ride.origin.address}</span>
                                <span class="ride-arrow">→</span>
                                <span class="ride-dest">${ride.destination.name || ride.destination.address}</span>
                            </div>
                        </div>
                        <div class="upcoming-ride-details">
                            <div class="upcoming-ride-indicators">
                                <div class="upcoming-ride-indicator">MR</div>
                                <div class="upcoming-ride-indicator passenger-count">+${ride.passengers || 1}</div>
                                <div class="upcoming-ride-indicator action">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/>
                                    </svg>
                                </div>
                            </div>
                            <div class="upcoming-ride-times">
                                <div class="upcoming-ride-time-row">
                                    <span>Pickup: ${ride.pickupTime || ride.datetime}</span>
                                </div>
                                <div class="upcoming-ride-time-row upcoming-ride-time-label">
                                    <span>Est arrival ${ride.arrivalTime || 'TBD'}</span>
                                </div>
                            </div>
                        </div>
                        <div class="upcoming-ride-journey">
                            <div class="journey-step">
                                <img src="assets/walking.svg" alt="Walk">
                                <span>${ride.walkToPickup || 4}</span>
                            </div>
                            <span class="journey-separator">›</span>
                            <div class="journey-step">
                                <img src="assets/microtransit.svg" alt="Vehicle">
                            </div>
                            <span class="journey-separator">›</span>
                            <div class="journey-step">
                                <img src="assets/YRT Logo.png" alt="Via" class="via-logo">
                            </div>
                            <span class="journey-separator">›</span>
                            <div class="journey-step">
                                <img src="assets/walking.svg" alt="Walk">
                                <span>${ride.walkFromDropoff || 2}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            ${showViewAllLink ? `
                <a href="#" class="view-all-link">View all upcoming rides</a>
            ` : ''}
        `;
        
        container.appendChild(widget);
        
        // Handle view all link click
        const viewAllLink = widget.querySelector('.view-all-link');
        if (viewAllLink) {
            viewAllLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.addMessageToChat('ai', 'Opening your upcoming rides...');
                // Could navigate to a full rides screen here
            });
        }
        
        this.scrollToBottom();
    }

    /**
     * Start recording in chat
     */
    async startRecordingInChat() {
        console.log('startRecordingInChat called, current state - isRecording:', this.isRecording, 'context:', this.recordingContext);
        
        if (!this.recognition) {
            console.error('Recognition not initialized');
            return;
        }
        
        // Request microphone permission first (this ensures browser remembers for session)
        if (!this.microphonePermissionGranted) {
            console.log('Requesting microphone permission...');
            const hasPermission = await this.requestMicrophonePermission();
            if (!hasPermission) {
                console.log('Microphone permission denied');
                const textInputChat = document.getElementById('text-input-chat');
                if (textInputChat) {
                    textInputChat.placeholder = 'Microphone access denied';
                }
                return;
            }
        }
        
        console.log('Permission state - granted:', this.microphonePermissionGranted, 'denied:', this.microphonePermissionDenied);
        
        // Force stop any existing recognition first
        if (this.isRecording || this.recordingContext) {
            console.log('Already recording in chat! Aborting existing session first');
            try {
                this.recognition.abort(); // Use abort instead of stop for immediate termination
            } catch (e) {
                console.log('Error aborting existing recognition:', e);
            }
            
            // Clear auto-stop timer and reset state
            if (this.autoStopTimer) {
                clearTimeout(this.autoStopTimer);
                this.autoStopTimer = null;
            }
            this.isRecording = false;
            this.recordingContext = null;
            
            // Wait a bit for abort to complete, then restart
            setTimeout(() => {
                this.startRecordingInChat();
            }, 200);
            return;
        }

        // Reset all state for new recording
        this.recordingContext = 'chat-screen';
        this.isRecording = true;
        this.currentTranscript = '';
        this.gotFinalResult = false;
        this.recognitionReady = false;
        
        const voiceBtn = document.getElementById('voice-btn-chat');
        const textInputChat = document.getElementById('text-input-chat');
        
        if (voiceBtn) {
            voiceBtn.classList.add('recording');
        }
        
        if (textInputChat) {
            textInputChat.placeholder = 'Requesting microphone...';
            textInputChat.value = ''; // Clear any existing text
        }

        console.log('Starting speech recognition in chat...');
        
        try {
            this.recordingStartTime = Date.now(); // Track start time
            this.recognition.start();
            console.log('Recognition start called in chat at', this.recordingStartTime);
            
            // Update UI after start
            if (textInputChat) {
                textInputChat.placeholder = 'Listening... (speak now)';
            }
            
            // Auto-stop after recordingDuration
            this.autoStopTimer = setTimeout(() => {
                console.log('Auto-stopping recording in chat after', this.recordingDuration, 'ms');
                if (this.isRecording) {
                    this.forceStopRecordingInChat();
                }
            }, this.recordingDuration);
        } catch (e) {
            console.error('Failed to start recognition in chat:', e);
            
            this.isRecording = false;
            this.recordingContext = null;
            this.currentTranscript = '';
            this.gotFinalResult = false;
            this.recordingStartTime = null;
            this.recognitionReady = false;
            
            if (voiceBtn) {
                voiceBtn.classList.remove('recording');
            }
            
            if (textInputChat) {
                textInputChat.placeholder = 'Voice input error. Please refresh and try again.';
                setTimeout(() => {
                    textInputChat.placeholder = 'Type a message...';
                }, 3000);
            }
        }
    }

    /**
     * Stop recording in chat (called when user releases button)
     * Note: Recording will continue until auto-stop timer completes
     */
    stopRecordingInChat() {
        console.log('stopRecordingInChat called (user released button)');
        
        if (!this.isRecording) return;
        
        const elapsed = Date.now() - (this.recordingStartTime || 0);
        console.log('User released after', elapsed, 'ms. Recording will continue until completion.');
        
        // Visual feedback that recording is still active
        const textInputChat = document.getElementById('text-input-chat');
        if (textInputChat && textInputChat.placeholder === 'Listening... (speak now)') {
            textInputChat.placeholder = 'Processing...';
        }
        
        // Note: We don't actually stop recognition here
        // The auto-stop timer will handle it
    }
    
    /**
     * Force stop recording in chat (called by auto-stop timer or when getting final result)
     */
    forceStopRecordingInChat() {
        console.log('forceStopRecordingInChat called');
        
        if (!this.recognition || !this.isRecording) return;
        
        // Clear auto-stop timer
        if (this.autoStopTimer) {
            clearTimeout(this.autoStopTimer);
            this.autoStopTimer = null;
        }
        
        // Stop the recognition
        try {
            this.recognition.stop();
            console.log('Recognition forcefully stopped in chat');
        } catch (e) {
            console.error('Failed to stop recognition in chat:', e);
            // Clean up on error
            this.isRecording = false;
            this.recordingContext = null;
            this.recordingStartTime = null;
            this.recognitionReady = false;
            
            const voiceBtn = document.getElementById('voice-btn-chat');
            const textInputChat = document.getElementById('text-input-chat');
            
            if (voiceBtn) {
                voiceBtn.classList.remove('recording');
            }
            
            if (textInputChat && !textInputChat.value.trim()) {
                textInputChat.placeholder = 'Type a message...';
            }
        }
    }

    /**
     * Toggle voice recording in chat (tap to start/stop)
     */
    toggleChatVoiceRecording() {
        console.log('toggleChatVoiceRecording called, isRecording:', this.isRecording);
        
        if (this.isRecording && this.recordingContext === 'chat-screen') {
            // Stop recording
            this.forceStopRecordingInChat();
        } else {
            // Start recording
            this.startRecordingInChat();
        }
    }

    /**
     * Handle user message
     */
    async handleUserMessage(message) {
        // Navigate to chat screen if not already there
        if (this.currentScreen !== 'agent-chat') {
            this.navigateToScreen('agent-chat');
        }

        // Add user message to chat
        this.addMessageToChat('user', message);

        // Determine context for loading indicator
        const lowerMessage = message.toLowerCase();
        let loadingContext = 'default';
        
        // Check if we're in cancellation flow
        if (this.aiAgent.pendingCancellationReason || this.aiAgent.pendingCancellationConfirmation) {
            loadingContext = 'cancel';
        } else if (/cancel/i.test(lowerMessage)) {
            loadingContext = 'cancel';
        } else if (/recent|past|previous|history/i.test(lowerMessage) && /ride|trip|journey/i.test(lowerMessage)) {
            loadingContext = 'recent_rides';
        } else if (/upcoming|scheduled|future|booked/i.test(lowerMessage) && /ride|trip|journey/i.test(lowerMessage)) {
            loadingContext = 'upcoming_rides';
        } else if (/point.*interest|place.*visit|attraction|landmark|things?\s*to\s*do/i.test(lowerMessage)) {
            loadingContext = 'poi';
        } else if (/book|ride|go to|take me|get me/i.test(lowerMessage)) {
            loadingContext = 'proposals';
        } else if (/change|update|modify|set|passenger|schedule/i.test(lowerMessage)) {
            loadingContext = 'modify';
        } else if (/confirm|yes|book it|book option/i.test(lowerMessage)) {
            loadingContext = 'booking';
        }
        
        // Show typing indicator with context
        this.showTypingIndicator(loadingContext);

        // Process with AI agent
        const response = await this.aiAgent.processMessage(message);

        // Remove typing indicator
        this.removeTypingIndicator();

        // Handle response
        this.handleAIResponse(response);
    }

    /**
     * Handle AI response
     */
    handleAIResponse(response) {
        switch (response.type) {
            case 'message':
                this.addMessageToChat('ai', response.content);
                this.aiAgent.speak(response.content);
                if (response.showChooseOnMap) {
                    this.addChooseOnMapButton();
                }
                break;

            case 'question':
                this.addMessageToChat('ai', response.content);
                this.aiAgent.speak(response.content);
                if (response.showChooseOnMap) {
                    this.addChooseOnMapButton();
                }
                break;

            case 'proposals':
                this.handleProposalsResponse(response);
                break;
            
            case 'proposal_selected':
                this.handleAIProposalSelection(response);
                break;
            
            case 'cancel_request':
                this.handleAICancelRequest(response);
                break;
            
            case 'cancel_booking':
                this.handleAICancelBooking(response);
                break;
            
            case 'modify_booking':
                this.handleAIModifyBooking(response);
                break;
            
            case 'walking_directions':
                this.handleWalkingDirectionsResponse(response);
                break;
            
            case 'cancellation_reason_prompt':
                this.handleCancellationReasonPrompt(response);
                break;
            
            case 'cancellation_confirmation_prompt':
                this.handleCancellationConfirmationPrompt(response);
                break;
            
            case 'cancellation_declined':
                this.handleCancellationDeclined(response);
                break;
            
            case 'payment_method_prompt':
                this.handlePaymentMethodPrompt(response);
                break;
            
            case 'payment_method_confirmed':
                this.handlePaymentMethodConfirmed(response);
                break;
            
            case 'passengers_prompt':
                this.handlePassengersPrompt(response);
                break;
            
            case 'service_hours_response':
                this.handleServiceHoursResponse(response);
                break;
            
            case 'service_hours_voice_confirmed':
                this.handleServiceHoursVoiceConfirmed(response);
                break;
            
            case 'recent_rides':
                this.handleRecentRidesResponse(response);
                break;
            
            case 'upcoming_rides':
                this.handleUpcomingRidesResponse(response);
                break;
            
            case 'points_of_interest':
                this.handlePointsOfInterestResponse(response);
                break;
        }
    }
    
    /**
     * Handle walking directions response
     */
    handleWalkingDirectionsResponse(response) {
        if (response.action === 'show') {
            this.addMessageToChat('ai', response.content);
            this.aiAgent.speak(response.content);
            // Trigger showing walking directions
            this.showWalkingDirections();
        }
    }
    
    /**
     * Handle cancellation reason prompt - show widget with options
     */
    async handleCancellationReasonPrompt(response) {
        // Show loading indicator first
        this.showTypingIndicator('cancel');
        
        // Simulate processing delay (1.5 seconds)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Remove loading indicator
        this.removeTypingIndicator();
        
        // Add the question message
        this.addMessageToChat('ai', response.content);
        
        // Show cancellation reasons widget
        this.showCancellationReasonsWidget(response.reasons);
        
        // Speak the question and then read the options with numbers
        const numberWords = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
        const reasonsList = response.reasons.map((r, i) => `${numberWords[i]}: ${r.label}`).join('. ');
        const speechText = `${response.content} Your options are: ${reasonsList}`;
        this.aiAgent.speak(speechText);
    }
    
    /**
     * Show cancellation reasons widget
     */
    showCancellationReasonsWidget(reasons) {
        const chatContainer = document.getElementById('chat-container');
        
        const widget = document.createElement('div');
        widget.className = 'cancellation-reasons-widget';
        widget.id = 'cancellation-reasons-widget';
        
        const optionsHtml = reasons.map(reason => `
            <label class="cancellation-reason-option" data-reason-id="${reason.id}">
                <div class="cancellation-radio">
                    <div class="cancellation-radio-inner"></div>
                </div>
                <span class="cancellation-label">${reason.label}</span>
            </label>
        `).join('');
        
        widget.innerHTML = `
            <div class="cancellation-reasons-options">
                ${optionsHtml}
            </div>
        `;
        
        chatContainer.appendChild(widget);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Add click handlers for each option
        widget.querySelectorAll('.cancellation-reason-option').forEach(option => {
            option.addEventListener('click', () => {
                const reasonId = option.dataset.reasonId;
                const reason = reasons.find(r => r.id === reasonId);
                this.selectCancellationReason(reason, widget);
            });
        });
    }
    
    /**
     * Select a cancellation reason (called from widget click)
     */
    async selectCancellationReason(reason, widget) {
        // Update UI to show selection (radio button style)
        if (widget) {
            widget.querySelectorAll('.cancellation-reason-option').forEach(option => {
                const isSelected = option.dataset.reasonId === reason.id;
                option.classList.toggle('selected', isSelected);
                const radio = option.querySelector('.cancellation-radio');
                if (radio) {
                    radio.classList.toggle('checked', isSelected);
                }
            });
        }
        
        // Add user's selection as a message
        this.addMessageToChat('user', reason.label);
        
        // Process through AI agent (don't remove widget - keep it visible)
        const response = await this.aiAgent.handleCancellationReasonSelected(reason);
        this.handleAIResponse(response);
    }
    
    /**
     * Handle cancellation confirmation prompt
     */
    handleCancellationConfirmationPrompt(response) {
        // DON'T remove the reasons widget - keep it visible
        
        // Add the confirmation message
        this.addMessageToChat('ai', response.content);
        
        // Add Yes/No confirmation buttons
        this.showCancellationConfirmationButtons();
        
        this.aiAgent.speak(response.content);
    }
    
    /**
     * Show Yes/No buttons for cancellation confirmation
     */
    showCancellationConfirmationButtons() {
        const chatContainer = document.getElementById('chat-container');
        
        const buttonsWrapper = document.createElement('div');
        buttonsWrapper.className = 'cancellation-confirmation-buttons';
        buttonsWrapper.id = 'cancellation-confirmation-buttons';
        
        buttonsWrapper.innerHTML = `
            <button class="cancellation-confirm-btn yes" id="cancel-yes-btn">
                Yes, cancel my ride
            </button>
            <button class="cancellation-confirm-btn dismiss" id="cancel-dismiss-btn">
                Dismiss
            </button>
        `;
        
        chatContainer.appendChild(buttonsWrapper);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Add click handlers
        document.getElementById('cancel-yes-btn').addEventListener('click', async () => {
            // Add user's response as message
            this.addMessageToChat('user', 'Yes, cancel my ride');
            
            // Remove buttons
            buttonsWrapper.remove();
            
            // Process cancellation
            const response = await this.aiAgent.handleCancellationConfirmed();
            this.handleAIResponse(response);
        });
        
        document.getElementById('cancel-dismiss-btn').addEventListener('click', async () => {
            // Add user's response as message
            this.addMessageToChat('user', 'Dismiss');
            
            // Remove buttons
            buttonsWrapper.remove();
            
            // Process decline
            const response = await this.aiAgent.handleCancellationDeclined();
            this.handleAIResponse(response);
        });
    }
    
    /**
     * Handle cancellation declined (user said no)
     */
    handleCancellationDeclined(response) {
        // DON'T remove the cancellation reasons widget - keep it visible for context
        
        // Remove confirmation buttons (in case user responded via voice/text)
        const confirmButtons = document.getElementById('cancellation-confirmation-buttons');
        if (confirmButtons) {
            confirmButtons.remove();
        }
        
        this.addMessageToChat('ai', response.content);
        this.aiAgent.speak(response.content);
    }
    
    /**
     * Handle payment method prompt - show widget with options
     */
    handlePaymentMethodPrompt(response) {
        // Add the question message
        this.addMessageToChat('ai', response.content);
        
        // Show payment methods widget
        this.showPaymentMethodsWidget(response.paymentMethods, response.currentMethod);
        
        // Speak the question and then read the options (include balance for ride credit)
        const methodsList = response.paymentMethods.map((pm, i) => {
            if (pm.type === 'ride-credit') {
                const balance = pm.balance ? `$${pm.balance.toFixed(2)} available` : '';
                return `${i + 1}: ${pm.name}${balance ? `, ${balance}` : ''}`;
            } else {
                return `${i + 1}: ${pm.type} ending in ${pm.last4}`;
            }
        }).join('. ');
        const speechText = `${response.content} Your options are: ${methodsList}`;
        this.aiAgent.speak(speechText);
    }
    
    /**
     * Show payment methods widget
     */
    showPaymentMethodsWidget(methods, currentMethod) {
        const chatContainer = document.getElementById('chat-container');
        
        const widget = document.createElement('div');
        widget.className = 'payment-methods-widget';
        widget.id = 'payment-methods-widget';
        
        const optionsHtml = methods.map(method => {
            const isSelected = currentMethod && method.id === currentMethod.id;
            let methodName;
            if (method.type === 'ride-credit') {
                const balance = method.balance ? `$${method.balance.toFixed(2)}` : '$0.00';
                methodName = `${method.name} (${balance} available)`;
            } else {
                methodName = `${method.type.charAt(0).toUpperCase() + method.type.slice(1)} **** ${method.last4}`;
            }
            
            // Generate icon based on payment type
            let iconHtml = '';
            if (method.type === 'mastercard') {
                iconHtml = `<svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                    <rect width="32" height="20" rx="3" fill="#F5F5F5"/>
                    <circle cx="12" cy="10" r="6" fill="#EB001B"/>
                    <circle cx="20" cy="10" r="6" fill="#F79E1B"/>
                    <path d="M16 5.5C17.5 6.7 18.5 8.2 18.5 10C18.5 11.8 17.5 13.3 16 14.5C14.5 13.3 13.5 11.8 13.5 10C13.5 8.2 14.5 6.7 16 5.5Z" fill="#FF5F00"/>
                </svg>`;
            } else if (method.type === 'visa') {
                iconHtml = `<svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                    <rect width="32" height="20" rx="3" fill="#F5F5F5"/>
                    <text x="6" y="14" font-family="Arial" font-size="10" font-weight="bold" fill="#1A1F71">VISA</text>
                </svg>`;
            } else if (method.type === 'ride-credit') {
                iconHtml = `<svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                    <rect width="32" height="20" rx="3" fill="#EBF5FF"/>
                    <path d="M16 4L18.5 9H13.5L16 4Z" fill="#007AFF"/>
                    <rect x="11" y="9" width="10" height="7" rx="1" fill="#007AFF"/>
                </svg>`;
            }
            
            return `
                <label class="payment-method-option ${isSelected ? 'selected' : ''}" data-method-id="${method.id}">
                    <div class="payment-radio ${isSelected ? 'checked' : ''}">
                        <div class="payment-radio-inner"></div>
                    </div>
                    <div class="payment-icon">${iconHtml}</div>
                    <span class="payment-label">${methodName}</span>
                </label>
            `;
        }).join('');
        
        widget.innerHTML = `
            <div class="payment-methods-options">
                ${optionsHtml}
            </div>
        `;
        
        chatContainer.appendChild(widget);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Add click handlers for each option
        widget.querySelectorAll('.payment-method-option').forEach(option => {
            option.addEventListener('click', () => {
                const methodId = option.dataset.methodId;
                const method = methods.find(m => m.id === methodId);
                this.selectPaymentMethod(method, widget);
            });
        });
    }
    
    /**
     * Select a payment method (called from widget click)
     */
    async selectPaymentMethod(method, widget) {
        // Update UI to show selection
        widget.querySelectorAll('.payment-method-option').forEach(option => {
            const isSelected = option.dataset.methodId === method.id;
            option.classList.toggle('selected', isSelected);
            option.querySelector('.payment-radio').classList.toggle('checked', isSelected);
        });
        
        // Process through AI agent (don't remove widget - keep it visible)
        const response = await this.aiAgent.handlePaymentMethodSelected(method);
        this.handleAIResponse(response);
    }
    
    /**
     * Handle payment method confirmed
     */
    handlePaymentMethodConfirmed(response) {
        // Don't remove the widget - keep it displayed
        
        // Update the widget to reflect the selection
        this.updatePaymentMethodWidget(response.paymentMethod);
        
        // Add the confirmation message
        this.addMessageToChat('ai', response.content);
        this.aiAgent.speak(response.content);
    }
    
    /**
     * Handle passengers prompt - show widget with counters
     */
    async handlePassengersPrompt(response) {
        // Show loading indicator first
        this.showTypingIndicator('default');
        
        // Simulate processing delay (1.5 seconds)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Remove loading indicator
        this.removeTypingIndicator();
        
        // Add the question message
        this.addMessageToChat('ai', response.content);
        
        // Show passengers widget
        this.showPassengersWidget(response.currentCounts);
        
        // Speak the question
        this.aiAgent.speak(response.content);
    }
    
    /**
     * Show passengers widget in chat
     */
    showPassengersWidget(currentCounts = { adult: 1, child: 0, pca: 0 }) {
        const chatContainer = document.getElementById('chat-container');
        
        // Store counts for later use
        this.passengerWidgetCounts = { ...currentCounts };
        
        const widget = document.createElement('div');
        widget.className = 'passengers-widget';
        widget.id = 'passengers-widget';
        
        widget.innerHTML = `
            <div class="passengers-options">
                ${this.createPassengerRowHTML('adult', 'Adult', currentCounts.adult)}
                ${this.createPassengerRowHTML('child', 'Child', currentCounts.child)}
                ${this.createPassengerRowHTML('pca', 'PCA', currentCounts.pca)}
                <div class="passengers-widget-footer">
                    <button class="passengers-update-btn" id="passengers-widget-update-btn">Update count</button>
                </div>
            </div>
        `;
        
        chatContainer.appendChild(widget);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Add counter button listeners
        widget.querySelectorAll('.counter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                const action = btn.dataset.action;
                this.updatePassengerWidgetCount(type, action);
            });
        });
        
        // Add update button listener
        document.getElementById('passengers-widget-update-btn').addEventListener('click', async () => {
            await this.confirmPassengerWidgetSelection();
        });
    }
    
    /**
     * Create passenger row HTML for widget
     */
    createPassengerRowHTML(type, label, count) {
        return `
            <div class="passenger-row" data-type="${type}">
                <span class="passenger-label">${label}</span>
                <div class="passenger-counter">
                    <button class="counter-btn minus" data-type="${type}" data-action="decrease">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M5 10H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <span class="counter-value ${count > 0 ? 'active' : ''}" id="widget-count-${type}">${count}</span>
                    <button class="counter-btn plus" data-type="${type}" data-action="increase">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M10 5V15M5 10H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Update passenger count in widget
     */
    updatePassengerWidgetCount(type, action) {
        if (action === 'increase') {
            this.passengerWidgetCounts[type]++;
        } else if (action === 'decrease' && this.passengerWidgetCounts[type] > 0) {
            // Don't allow adult to go below 1
            if (type === 'adult' && this.passengerWidgetCounts[type] <= 1) {
                return;
            }
            this.passengerWidgetCounts[type]--;
        }
        
        // Update display
        const countEl = document.getElementById(`widget-count-${type}`);
        if (countEl) {
            countEl.textContent = this.passengerWidgetCounts[type];
            countEl.classList.toggle('active', this.passengerWidgetCounts[type] > 0);
        }
    }
    
    /**
     * Confirm passenger widget selection
     */
    async confirmPassengerWidgetSelection() {
        const total = this.passengerWidgetCounts.adult + this.passengerWidgetCounts.child + this.passengerWidgetCounts.pca;
        
        if (total === 0) {
            console.warn('[PassengersWidget] Cannot have 0 passengers');
            return;
        }
        
        console.log('[PassengersWidget] Confirming selection:', this.passengerWidgetCounts, 'Total:', total);
        
        // Update booking context
        this.aiAgent.bookingContext.passengers = total;
        this.aiAgent.bookingContext.passengerTypes = { ...this.passengerWidgetCounts };
        this.aiAgent.pendingQuestion = null;
        
        // Remove the widget
        const widget = document.getElementById('passengers-widget');
        if (widget) {
            widget.remove();
        }
        
        // Add user confirmation as message
        const breakdown = this.getPassengerBreakdownText();
        this.addMessageToChat('user', `${total} passengers (${breakdown})`);
        
        // Trigger proposal regeneration
        if (this.aiAgent.currentProposals) {
            const response = await this.aiAgent.handleParamModification('passengers', total);
            this.handleAIResponse(response);
        } else {
            // Just confirm the update
            const message = `Updated to ${total} passengers (${breakdown}).`;
            this.addMessageToChat('ai', message);
            this.aiAgent.speak(message);
        }
    }
    
    /**
     * Get passenger breakdown text
     */
    getPassengerBreakdownText() {
        const parts = [];
        if (this.passengerWidgetCounts.adult > 0) {
            parts.push(`${this.passengerWidgetCounts.adult} adult${this.passengerWidgetCounts.adult > 1 ? 's' : ''}`);
        }
        if (this.passengerWidgetCounts.child > 0) {
            parts.push(`${this.passengerWidgetCounts.child} child${this.passengerWidgetCounts.child > 1 ? 'ren' : ''}`);
        }
        if (this.passengerWidgetCounts.pca > 0) {
            parts.push(`${this.passengerWidgetCounts.pca} PCA`);
        }
        return parts.join(', ');
    }
    
    /**
     * Handle service hours response - show widget
     */
    handleServiceHoursResponse(response) {
        // Add the specific day message
        this.addMessageToChat('ai', response.specificDayResponse);
        
        // Show the service hours widget
        this.showServiceHoursWidget(response.regularSchedule, response.upcomingSpecial);
        
        // Add the voice prompt
        const voicePromptMessage = response.voicePrompt;
        this.addMessageToChat('ai', voicePromptMessage);
        
        // Speak only the specific day response and the question
        const speechText = `${response.specificDayResponse} ${voicePromptMessage}`;
        this.aiAgent.speak(speechText);
    }
    
    /**
     * Handle service hours voice confirmed - speak full schedule
     */
    handleServiceHoursVoiceConfirmed(response) {
        this.addMessageToChat('ai', 'Reading the full schedule...');
        this.aiAgent.speak(response.speech);
    }
    
    /**
     * Handle recent rides response from natural language query
     */
    handleRecentRidesResponse(response) {
        this.addMessageToChat('ai', response.content);
        this.aiAgent.speak(response.content);
        this.renderRecentRidesWidget(response.recentRides);
    }
    
    /**
     * Handle upcoming rides response from natural language query
     */
    handleUpcomingRidesResponse(response) {
        this.addMessageToChat('ai', response.content);
        this.aiAgent.speak(response.content);
        this.renderUpcomingRidesWidget(response.upcomingRides, response.showViewAllLink);
    }
    
    /**
     * Handle points of interest response from natural language query
     */
    handlePointsOfInterestResponse(response) {
        // Add the response message
        this.addMessageToChat('ai', response.content);
        this.aiAgent.speak(response.content);
        
        // Render the POI widget
        this.renderPointsOfInterestWidget(response.pointsOfInterest);
    }
    
    /**
     * Show service hours widget in chat
     */
    showServiceHoursWidget(regularSchedule, upcomingSpecial) {
        const chatContainer = document.getElementById('chat-container');
        
        const widget = document.createElement('div');
        widget.className = 'service-hours-widget';
        widget.id = 'service-hours-widget';
        
        // Find weekday hours (Mon-Sat) and Sunday hours
        const weekdaySchedule = regularSchedule.find(d => d.day === 'Monday');
        const saturdaySchedule = regularSchedule.find(d => d.day === 'Saturday');
        const sundaySchedule = regularSchedule.find(d => d.day === 'Sunday');
        
        // Determine weekday range text
        let weekdayText = 'Mon - Sat';
        let weekdayHours = weekdaySchedule && !weekdaySchedule.closed 
            ? `${weekdaySchedule.open} - ${weekdaySchedule.close}` 
            : 'Not operating';
        
        // If Saturday is different, adjust
        if (saturdaySchedule && saturdaySchedule.closed && weekdaySchedule && !weekdaySchedule.closed) {
            weekdayText = 'Mon - Fri';
        }
        
        const sundayHours = sundaySchedule && !sundaySchedule.closed 
            ? `${sundaySchedule.open} - ${sundaySchedule.close}` 
            : 'Not operating';
        
        // Build special dates note
        let specialNote = 'No service on public holidays';
        if (upcomingSpecial && upcomingSpecial.length > 0) {
            const nextSpecial = upcomingSpecial[0];
            specialNote = nextSpecial.closed 
                ? `No service on ${nextSpecial.date} (${nextSpecial.name})`
                : `Modified hours on ${nextSpecial.date}: ${nextSpecial.open} - ${nextSpecial.close}`;
        }
        
        // Clock icon SVG
        const clockIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 7v5l3 3" stroke-linecap="round"/>
        </svg>`;
        
        // Info icon SVG
        const infoIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 16v-4M12 8h.01" stroke-linecap="round"/>
        </svg>`;
        
        // Day tabs
        const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
        const todayIndex = today === 0 ? 6 : today - 1; // Convert to 0 = Monday
        
        const dayTabsHTML = days.map((day, i) => `
            <button class="service-hours-day-tab ${i === todayIndex ? 'active' : ''}" data-day="${i}">
                ${day}
            </button>
        `).join('');
        
        // Generate bar chart data (simulated demand pattern)
        const demandPatterns = {
            weekday: [30, 45, 70, 85, 75, 65, 55, 50, 60, 75, 85, 70, 55, 40, 35, 30],
            saturday: [20, 30, 45, 55, 60, 65, 70, 75, 80, 75, 65, 50, 40, 30, 25, 20],
            sunday: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] // closed
        };
        
        const getCurrentPattern = (dayIdx) => {
            if (dayIdx === 6) return demandPatterns.sunday;
            if (dayIdx === 5) return demandPatterns.saturday;
            return demandPatterns.weekday;
        };
        
        const currentPattern = getCurrentPattern(todayIndex);
        const barsHTML = currentPattern.map((height, i) => `
            <div class="service-hours-bar" style="height: ${height}%;" data-hour="${6 + i}"></div>
        `).join('');
        
        widget.innerHTML = `
            <div class="service-hours-content">
                <div class="service-hours-summary">
                    <div class="service-hours-summary-row">
                        <span class="summary-icon">${clockIcon}</span>
                        <span class="summary-label">${weekdayText}</span>
                        <span class="summary-value">${weekdayHours}</span>
                    </div>
                    <div class="service-hours-summary-row">
                        <span class="summary-icon">${clockIcon}</span>
                        <span class="summary-label">Sunday</span>
                        <span class="summary-value ${sundayHours === 'Not operating' ? 'not-operating' : ''}">${sundayHours}</span>
                    </div>
                    <div class="service-hours-summary-row info">
                        <span class="summary-icon">${infoIcon}</span>
                        <span class="summary-label">${specialNote}</span>
                    </div>
                </div>
                <div class="service-hours-chart-section">
                    <div class="service-hours-tabs">
                        ${dayTabsHTML}
                    </div>
                    <div class="service-hours-chart" id="service-hours-chart">
                        <div class="service-hours-bars">
                            ${barsHTML}
                        </div>
                        <div class="service-hours-x-axis">
                            <span>6:00</span>
                            <span>12:00</span>
                            <span>15:00</span>
                            <span>18:00</span>
                            <span>21:00</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        chatContainer.appendChild(widget);
        
        // Add tab click handlers
        widget.querySelectorAll('.service-hours-day-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // Update active tab
                widget.querySelectorAll('.service-hours-day-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update chart
                const dayIdx = parseInt(tab.dataset.day);
                const pattern = getCurrentPattern(dayIdx);
                const bars = widget.querySelectorAll('.service-hours-bar');
                bars.forEach((bar, i) => {
                    bar.style.height = `${pattern[i]}%`;
                });
            });
        });
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    /**
     * Update payment method widget to show selected method
     */
    updatePaymentMethodWidget(selectedMethod) {
        const widget = document.getElementById('payment-methods-widget');
        if (!widget || !selectedMethod) return;
        
        // Update all options in the widget
        widget.querySelectorAll('.payment-method-option').forEach(option => {
            const isSelected = option.dataset.methodId === selectedMethod.id;
            option.classList.toggle('selected', isSelected);
            const radio = option.querySelector('.payment-radio');
            if (radio) {
                radio.classList.toggle('checked', isSelected);
            }
        });
    }
    
    /**
     * Add "Choose on Map" button to chat
     */
    addChooseOnMapButton() {
        const chatContainer = document.getElementById('chat-container');
        
        const wrapper = document.createElement('div');
        wrapper.className = 'choose-on-map-wrapper';
        
        const button = document.createElement('button');
        button.className = 'choose-on-map-btn';
        button.innerHTML = `
            <span class="map-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 10C11.1046 10 12 9.10457 12 8C12 6.89543 11.1046 6 10 6C8.89543 6 8 6.89543 8 8C8 9.10457 8.89543 10 10 10Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M10 17C13 14 16 11.3137 16 8C16 4.68629 13.3137 2 10 2C6.68629 2 4 4.68629 4 8C4 11.3137 7 14 10 17Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </span>
            <span>Choose on map</span>
        `;
        
        button.addEventListener('click', () => {
            this.handleChooseOnMap();
        });
        
        wrapper.appendChild(button);
        chatContainer.appendChild(wrapper);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    /**
     * Handle choose on map action
     */
    handleChooseOnMap() {
        // For now, show a message that this feature is coming soon
        // In a full implementation, this would open a map picker
        this.addMessageToChat('ai', 'Map picker opening... (This feature allows you to select a location within Arlington, TX on the map)');
        
        // TODO: Implement full map picker UI
        // This would involve:
        // 1. Show a full-screen map modal
        // 2. Center on Arlington, TX
        // 3. Add a draggable pin
        // 4. Show "Confirm Location" button
        // 5. Return selected coordinates and reverse geocode to address
    }

    /**
     * Handle proposals response
     */
    async handleProposalsResponse(response) {
        // Remove old proposals and chips if they exist (for parameter modifications)
        const chatContainer = document.getElementById('chat-container');
        const oldCarousel = chatContainer.querySelector('.carousel-container');
        const oldChips = chatContainer.querySelector('.message-chips');
        
        if (oldCarousel) {
            oldCarousel.remove();
        }
        if (oldChips) {
            oldChips.remove();
        }
        
        // Add AI message
        this.addMessageToChat('ai', response.content);

        // Add proposals first (pass datetime for conditional rendering)
        this.currentProposals = response.proposals;
        const datetime = response.chips?.datetime || 'now';
        this.addProposalsToChat(response.proposals, datetime);

        // Add chips after proposals with 12px spacing
        if (response.chips) {
            this.addChipsToChat(response.chips);
        }

        // Start TTS and auto-scroll if enabled
        if (CONFIG.features.textToSpeech && CONFIG.features.autoScrollCarousel) {
            this.startProposalPresentation(response.proposals);
        }
    }

    /**
     * Handle proposal selection from AI voice/text command
     */
    async handleAIProposalSelection(response) {
        // Add confirmation message
        this.addMessageToChat('ai', response.content);
        this.aiAgent.speak(response.content);
        
        // Short delay for natural feel
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Store selected proposal
        this.selectedProposal = response.proposal;
        
        // Remove proposals and chips from chat (they're no longer needed)
        const chatContainer = document.getElementById('chat-container');
        const carouselContainer = chatContainer.querySelector('.carousel-container');
        const chipsContainer = chatContainer.querySelector('.message-chips');
        
        if (carouselContainer) {
            carouselContainer.remove();
        }
        if (chipsContainer) {
            chipsContainer.remove();
        }
        
        // Directly book the ride (skip modal)
        await this.autoConfirmBooking();
    }

    /**
     * Handle cancel request from AI
     */
    handleAICancelRequest(response) {
        // Stop any ongoing TTS
        this.aiAgent.stopSpeaking();
        this.userInterruptedPresentation = true;
        
        // Remove proposals if showing
        const chatContainer = document.getElementById('chat-container');
        const carouselContainer = chatContainer.querySelector('.carousel-container');
        const chipsContainer = chatContainer.querySelector('.message-chips');
        
        if (carouselContainer) carouselContainer.remove();
        if (chipsContainer) chipsContainer.remove();
        
        // Clear stored proposals
        this.currentProposals = null;
        
        // Add message
        this.addMessageToChat('ai', response.content);
        this.aiAgent.speak(response.content);
    }

    /**
     * Handle cancel booking from AI
     */
    handleAICancelBooking(response) {
        // DON'T remove the cancellation reasons widget - keep it visible for context
        
        // Remove confirmation buttons (in case user responded via voice/text)
        const confirmButtons = document.getElementById('cancellation-confirmation-buttons');
        if (confirmButtons) {
            confirmButtons.remove();
        }
        
        // Add message
        this.addMessageToChat('ai', response.content);
        this.aiAgent.speak(response.content);
        
        // Actually cancel the ride (remove booking widgets, reset state)
        this.performRideCancellation();
    }
    
    /**
     * Perform the actual ride cancellation (without adding message)
     */
    performRideCancellation() {
        // Remove booking summary and driver widgets
        const bookingWidget = document.getElementById('booking-summary-widget');
        const driverWidget = document.getElementById('driver-widget');
        const walkingMapBtn = document.querySelector('.walking-map-button-wrapper');
        
        if (bookingWidget) bookingWidget.remove();
        if (driverWidget) driverWidget.remove();
        if (walkingMapBtn) walkingMapBtn.remove();
        
        // Reset booking state
        this.currentBooking = null;
        this.selectedProposal = null;
        this.currentDriver = null;
        this.walkingDirections = null;
        
        // Reset AI agent state
        this.aiAgent.currentState = 'INITIAL';
        this.aiAgent.selectedProposal = null;
    }

    /**
     * Handle modify booking from AI
     */
    async handleAIModifyBooking(response) {
        // This should not be called anymore - modifications should return 'proposals' type
        // But keep as fallback
        this.addMessageToChat('ai', response.content);
        this.aiAgent.speak(response.content);
    }

    /**
     * Start proposal presentation with TTS and auto-scroll
     */
    async startProposalPresentation(proposals) {
        for (let i = 0; i < proposals.length; i++) {
            const proposal = proposals[i];
            const text = this.generateProposalText(proposal, i);

            // Scroll to proposal
            this.scrollToProposal(i);

            // Speak proposal text
            await new Promise((resolve) => {
                this.aiAgent.speak(text, resolve);
            });

            // Pause between proposals
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Check if user interrupted (tapped/swiped)
            if (this.userInterruptedPresentation) {
                break;
            }
        }
    }

    /**
     * Generate proposal text for TTS
     */
    generateProposalText(proposal, index) {
        const pickupTime = this.bookingService.getTimeFromNow(proposal.pickupTime);
        const duration = proposal.duration;
        const arrivalTime = this.bookingService.formatTime(proposal.arrivalTime);

        return `Option ${index + 1}: Pickup ${pickupTime}, ${duration} minute ride, arriving at ${arrivalTime}`;
    }

    /**
     * Scroll to specific proposal in carousel
     */
    scrollToProposal(index) {
        const carousel = document.querySelector('.carousel-container');
        if (!carousel) return;

        const cards = carousel.querySelectorAll('.proposal-card');
        if (cards[index]) {
            cards[index].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }

    /**
     * Add message to chat
     */
    addMessageToChat(role, content) {
        const chatContainer = document.getElementById('chat-container');
        
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${role}`;
        
        if (role === 'ai') {
            // Add agent icon before AI messages
            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'chat-message-wrapper';
            
            const icon = document.createElement('img');
            icon.src = 'assets/agent%20icon.svg';
            icon.className = 'chat-agent-icon';
            icon.alt = 'Agent';
            
            iconWrapper.appendChild(icon);
            iconWrapper.appendChild(bubble);
            
            bubble.textContent = content;
            chatContainer.appendChild(iconWrapper);
        } else {
            bubble.textContent = content;
            chatContainer.appendChild(bubble);
        }
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    /**
     * Add chips to chat
     */
    addChipsToChat(chips) {
        console.log('[addChipsToChat] Chips received:', chips);
        
        const chatContainer = document.getElementById('chat-container');
        
        const chipsContainer = document.createElement('div');
        chipsContainer.className = 'message-chips';
        chipsContainer.style.paddingLeft = '24px';
        chipsContainer.style.marginTop = '0px';
        
        // Payment chip
        if (chips.payment) {
            const paymentChip = document.createElement('button');
            paymentChip.className = 'chip';
            
            // Choose icon based on payment method type
            let paymentIcon = '';
            if (chips.payment.type === 'visa') {
                paymentIcon = '<img src="assets/payment_method.svg" class="icon-img" alt="Payment">';
            } else if (chips.payment.type === 'mastercard') {
                // Use a fallback icon for mastercard (different from visa)
                paymentIcon = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="display:inline-block;vertical-align:middle;"><circle cx="6" cy="8" r="5" fill="#EB001B" opacity="0.8"/><circle cx="10" cy="8" r="5" fill="#F79E1B" opacity="0.8"/></svg>';
            } else if (chips.payment.type === 'ride-credit') {
                paymentIcon = '<img src="assets/payment_method.svg" class="icon-img" alt="Payment">';
            } else {
                // Default fallback
                paymentIcon = '<img src="assets/payment_method.svg" class="icon-img" alt="Payment">';
            }
            
            paymentChip.innerHTML = `
                <span class="icon">${paymentIcon}</span>
                <span>${chips.payment.last4 || chips.payment.name}</span>
            `;
            
            // Add click handler to open payment modal
            paymentChip.addEventListener('click', () => {
                console.log('[addChipsToChat] Opening payment modal with method:', chips.payment);
                this.paymentModal.open(chips.payment);
            });
            
            chipsContainer.appendChild(paymentChip);
        }
        
        // Datetime chip
        const datetimeChip = document.createElement('button');
        datetimeChip.className = 'chip';
        const datetimeText = this.formatDatetimeChip(chips.datetime);
        datetimeChip.innerHTML = `
            <img src="assets/schedule.svg" class="icon-img" alt="Time">
            <span>${datetimeText}</span>
        `;
        
        // Add click handler to open scheduling modal
        datetimeChip.addEventListener('click', () => {
            console.log('[addChipsToChat] Opening scheduling modal with datetime:', chips.datetime);
            this.schedulingModal.open(chips.datetime);
        });
        
        chipsContainer.appendChild(datetimeChip);
        
        // Passengers chip - display only the number
        const passengersChip = document.createElement('button');
        passengersChip.className = 'chip';
        passengersChip.innerHTML = `
            <img src="assets/passengers.svg" class="icon-img" alt="Passengers">
            <span>${chips.passengers}</span>
        `;
        
        // Add click handler to open passengers modal
        passengersChip.addEventListener('click', () => {
            console.log('[addChipsToChat] Opening passengers modal with count:', chips.passengers);
            this.passengersModal.open(chips.passengers);
        });
        
        chipsContainer.appendChild(passengersChip);
        
        chatContainer.appendChild(chipsContainer);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    /**
     * Format datetime for chip display
     */
    formatDatetimeChip(datetime) {
        console.log('[formatDatetimeChip] Input:', datetime);
        
        if (datetime === 'now' || datetime === 'Now') {
            return 'Now';
        }
        
        // Month name mapping for short versions
        const monthMap = {
            'january': 'Jan', 'february': 'Feb', 'march': 'Mar', 'april': 'Apr',
            'may': 'May', 'june': 'Jun', 'july': 'Jul', 'august': 'Aug',
            'september': 'Sep', 'october': 'Oct', 'november': 'Nov', 'december': 'Dec',
            'jan': 'Jan', 'feb': 'Feb', 'mar': 'Mar', 'apr': 'Apr',
            'may': 'May', 'jun': 'Jun', 'jul': 'Jul', 'aug': 'Aug',
            'sep': 'Sep', 'oct': 'Oct', 'nov': 'Nov', 'dec': 'Dec'
        };
        
        // Handle formats like "tomorrow at 3:00 pm", "today at 2:30 pm", "November 12 at 5:00 pm"
        if (typeof datetime === 'string') {
            // Check if it contains a month name (specific date)
            const monthMatch = datetime.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/i);
            if (monthMatch) {
                const monthShort = monthMap[monthMatch[1].toLowerCase()];
                const day = monthMatch[2];
                
                // Check if there's a time
                const timeMatch = datetime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
                if (timeMatch) {
                    const formatted = `${monthShort} ${day}, ${timeMatch[1]}:${timeMatch[2]} ${timeMatch[3] ? timeMatch[3].toUpperCase() : ''}`.trim();
                    console.log('[formatDatetimeChip] Formatted date with time:', formatted);
                    return formatted;
                }
                // Date only
                const formatted = `${monthShort} ${day}`;
                console.log('[formatDatetimeChip] Formatted date only:', formatted);
                return formatted;
            }
            
            // Check if it starts with "tomorrow" or "today"
            if (datetime.toLowerCase().includes('tomorrow')) {
                // Extract time if present
                const timeMatch = datetime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
                if (timeMatch) {
                    const formatted = `Tomorrow, ${timeMatch[1]}:${timeMatch[2]} ${timeMatch[3] ? timeMatch[3].toUpperCase() : ''}`.trim();
                    console.log('[formatDatetimeChip] Formatted as:', formatted);
                    return formatted;
                }
                return 'Tomorrow';
            }
            if (datetime.toLowerCase().includes('today')) {
                const timeMatch = datetime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
                if (timeMatch) {
                    const formatted = `Today, ${timeMatch[1]}:${timeMatch[2]} ${timeMatch[3] ? timeMatch[3].toUpperCase() : ''}`.trim();
                    console.log('[formatDatetimeChip] Formatted as:', formatted);
                    return formatted;
                }
                return 'Today';
            }
            // Just a time like "3:00 pm"
            const timeMatch = datetime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
            if (timeMatch) {
                const formatted = `${timeMatch[1]}:${timeMatch[2]} ${timeMatch[3] ? timeMatch[3].toUpperCase() : ''}`.trim();
                console.log('[formatDatetimeChip] Formatted as time only:', formatted);
                return formatted;
            }
        }
        
        // Fallback: return as-is
        console.log('[formatDatetimeChip] Returning as-is:', datetime);
        return datetime;
    }

    /**
     * Add proposals to chat
     */
    addProposalsToChat(proposals, datetime = 'now') {
        const chatContainer = document.getElementById('chat-container');
        
        const carouselContainer = document.createElement('div');
        carouselContainer.className = 'carousel-container';
        
        proposals.forEach((proposal, index) => {
            const card = this.createProposalCard(proposal, index, datetime);
            carouselContainer.appendChild(card);
        });
        
        chatContainer.appendChild(carouselContainer);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Add carousel interaction listeners
        carouselContainer.addEventListener('touchstart', () => {
            this.userInterruptedPresentation = true;
            this.aiAgent.stopSpeaking();
        });

        carouselContainer.addEventListener('mousedown', () => {
            this.userInterruptedPresentation = true;
            this.aiAgent.stopSpeaking();
        });
    }

    /**
     * Check if datetime represents a future booking (not now or tomorrow)
     */
    isFutureBooking(datetime) {
        if (!datetime || datetime === 'now' || datetime === 'Now') {
            return false;
        }
        if (datetime.toLowerCase().includes('tomorrow') || datetime.toLowerCase().includes('today')) {
            return false;
        }
        // If it contains a month name or specific date, it's a future booking
        return /january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(datetime);
    }

    /**
     * Create proposal card element
     */
    createProposalCard(proposal, index, datetime = 'now') {
        const card = document.createElement('div');
        card.className = 'proposal-card';
        card.dataset.proposalId = proposal.id;
        
        const isFuture = this.isFutureBooking(datetime);
        console.log('[createProposalCard] Datetime:', datetime, 'Is future booking:', isFuture);
        
        // Map container
        const mapDiv = document.createElement('div');
        mapDiv.className = 'proposal-map';
        mapDiv.id = `proposal-map-${index}`;
        
        // Initialize Google Map if enabled
        if (CONFIG.features.googleMaps && window.google && window.google.maps) {
            setTimeout(() => {
                this.initializeProposalMap(mapDiv, proposal, index);
            }, 100);
        } else {
            // Stylized fallback map with custom markers
            mapDiv.style.background = 'linear-gradient(135deg, #e8f4f8 0%, #f0f5f9 50%, #e8ecf0 100%)';
            mapDiv.innerHTML = `
                <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
                    <svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.2;">
                        <defs>
                            <pattern id="grid-${index}" width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#c8d0d8" stroke-width="1"/>
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid-${index})" />
                        <!-- Walking path (dotted grey) -->
                        <line x1="15%" y1="85%" x2="25%" y2="75%" stroke="#9ca3af" stroke-width="2" opacity="0.8" stroke-dasharray="2,4" />
                        <!-- Main route -->
                        <line x1="25%" y1="75%" x2="75%" y2="25%" stroke="#0069e2" stroke-width="3" opacity="0.7" />
                    </svg>
                    <!-- Start point (user location) - small blue dot -->
                    <div style="position:absolute;bottom:15%;left:15%;width:8px;height:8px;background:#0069e2;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.2);"></div>
                    <!-- Pickup marker with custom icon -->
                    <img src="assets/pickup_marker.svg" style="position:absolute;bottom:calc(75% - 24px);left:calc(25% - 12px);width:24px;height:24px;" alt="Pickup">
                    <!-- Destination marker with custom icon -->
                    <img src="assets/dropoff_marker.svg" style="position:absolute;top:calc(25% - 24px);right:calc(25% - 12px);width:24px;height:24px;" alt="Dropoff">
                </div>
            `;
        }
        
        // Proposal info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'proposal-info';
        
        const pickupTime = this.bookingService.getTimeFromNow(proposal.pickupTime);
        const arrivalTime = this.bookingService.formatTime(proposal.arrivalTime);
        
        // For future bookings (not now/tomorrow), hide the pickup time ETA
        const pickupTimeHtml = isFuture ? '' : `
                <div class="proposal-pickup">
                    <img src="assets/gps.svg" class="proposal-pickup-icon" alt="ETA">
                    <span class="proposal-pickup-text">${pickupTime}</span>
                </div>`;
        
        infoDiv.innerHTML = `
            <div class="proposal-summary-row">
                ${pickupTimeHtml}
                <div class="proposal-price-eta">
                    <span class="proposal-price">${CONFIG.pricing.currency}${proposal.price.toFixed(2)}</span>
                    <span class="proposal-duration">${proposal.duration} min</span>
                    <span class="proposal-sep">•</span>
                    <span class="proposal-eta">${arrivalTime}</span>
                </div>
            </div>
            <div class="proposal-legs">
                <img src="assets/walking.svg" style="width: 16px; height: 16px;" alt="Walk">
                <span style="font-size: 12px; color: var(--label-secondary); font-weight: var(--caption-medium-weight);">2</span>
                <svg width="4" height="16" viewBox="0 0 4 16" fill="none" style="margin: 0 2px;">
                    <path d="M2 4L3.5 7.5L2 11" stroke="#4f545d" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <img src="assets/microtransit.svg" style="width: 20px; height: 20px;" alt="Transit">
                <img src="assets/YRT Logo.png" style="height: 16px; margin-left: 2px;" alt="YRT">
                <svg width="4" height="16" viewBox="0 0 4 16" fill="none" style="margin: 0 2px;">
                    <path d="M2 4L3.5 7.5L2 11" stroke="#4f545d" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <img src="assets/walking.svg" style="width: 16px; height: 16px;" alt="Walk">
                <span style="font-size: 12px; color: var(--label-secondary); font-weight: var(--caption-medium-weight);">5</span>
            </div>
        `;
        
        card.appendChild(mapDiv);
        card.appendChild(infoDiv);
        
        // Click handler
        card.addEventListener('click', () => {
            this.handleProposalSelection(proposal);
        });
        
        return card;
    }
    
    /**
     * Extract street name and number from full address
     */
    getShortAddress(fullAddress) {
        if (!fullAddress) return '';
        
        // Remove city, state, country (Arlington, Texas, USA, etc.)
        const parts = fullAddress.split(',');
        
        // Return just the first part (street number and name)
        return parts[0].trim();
    }

    /**
     * Initialize Google Map for proposal
     * VERSION: 2026-02-03-v2 (Grey walking path)
     */
    initializeProposalMap(mapElement, proposal, index) {
        console.log('[initializeProposalMap] STARTING - Version 2026-02-03-v2');
        if (!window.google || !window.google.maps) {
            mapElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6c7380;">Map unavailable</div>';
            return;
        }
        
        try {
            const startPoint = {
                lat: proposal.origin.lat - 0.001,  // Slightly offset from pickup
                lng: proposal.origin.lng - 0.001
            };
            const pickupPoint = proposal.origin;
            const destination = proposal.destination;
            
            // Calculate bounds to show all points with padding
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(startPoint);
            bounds.extend({ lat: pickupPoint.lat, lng: pickupPoint.lng });
            bounds.extend({ lat: destination.lat, lng: destination.lng });
            
            // Get current theme for map styles
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            
            const map = new google.maps.Map(mapElement, {
                center: bounds.getCenter(),
                zoom: 12,  // Zoomed out more
                disableDefaultUI: true,
                zoomControl: false,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
                styles: getMapStyles(currentTheme)
            });
            
            // Store map reference on element for theme updates
            mapElement._googleMap = map;
            
            // Fit bounds with padding
            map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
            
            // Add starting point marker (user's actual location) - small blue dot
            const startMarker = new google.maps.Marker({
                position: startPoint,
                map: map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 5,
                    fillColor: '#0069e2',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2
                },
                zIndex: 1
            });
            
            // Add pickup point marker (where bus picks up) - custom pickup marker
            const pickupMarker = new google.maps.Marker({
                position: { lat: pickupPoint.lat, lng: pickupPoint.lng },
                map: map,
                icon: {
                    url: 'assets/pickup_marker.svg',
                    scaledSize: new google.maps.Size(32, 32),
                    anchor: new google.maps.Point(16, 32)
                },
                zIndex: 3
            });
            
            // Add pickup address label with short address
            const pickupShortAddr = this.getShortAddress(pickupPoint.address);
            const pickupLabel = new google.maps.InfoWindow({
                content: `<div class="map-address-bubble">${pickupShortAddr || 'Pickup'}</div>`,
                disableAutoPan: true
            });
            pickupLabel.open(map, pickupMarker);
            
            // Add destination marker - custom dropoff marker
            const destMarker = new google.maps.Marker({
                position: { lat: destination.lat, lng: destination.lng },
                map: map,
                icon: {
                    url: 'assets/dropoff_marker.svg',
                    scaledSize: new google.maps.Size(32, 32),
                    anchor: new google.maps.Point(16, 32)
                },
                zIndex: 2
            });
            
            // Add destination address label with short address
            const destShortAddr = this.getShortAddress(destination.address);
            const destLabel = new google.maps.InfoWindow({
                content: `<div class="map-address-bubble">${destShortAddr || 'Destination'}</div>`,
                disableAutoPan: true
            });
            destLabel.open(map, destMarker);
            
            // Draw route line from pickup to destination (blue - solid)
            const routePath = new google.maps.Polyline({
                path: [
                    { lat: pickupPoint.lat, lng: pickupPoint.lng },
                    { lat: destination.lat, lng: destination.lng }
                ],
                geodesic: true,
                strokeColor: '#0069e2',
                strokeOpacity: 0.8,
                strokeWeight: 3,
                map: map,
                zIndex: 1
            });
            
            // Draw walking path from start to pickup (grey - on top)
            const walkingPath = new google.maps.Polyline({
                path: [startPoint, { lat: pickupPoint.lat, lng: pickupPoint.lng }],
                geodesic: true,
                strokeColor: '#9ca3af',  // Grey color
                strokeOpacity: 1,
                strokeWeight: 2,
                map: map,
                zIndex: 2  // Higher zIndex to appear on top of blue line
            });
            
            console.log('[initializeProposalMap] Created walking path with grey color #9ca3af and zIndex 2');
        } catch (error) {
            console.error('Failed to initialize proposal map:', error);
            mapElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6c7380;">Map unavailable</div>';
        }
    }

    /**
     * Handle proposal selection
     */
    handleProposalSelection(proposal) {
        this.selectedProposal = proposal;
        this.userInterruptedPresentation = true;
        this.aiAgent.stopSpeaking();
        this.showTripDetailsModal(proposal);
    }

    /**
     * Show trip details modal
     */
    showTripDetailsModal(proposal) {
        const modal = document.getElementById('trip-modal');
        const modalHeader = modal.querySelector('.modal-header');
        const modalBody = document.getElementById('modal-body');
        
        // Hide the header
        modalHeader.style.display = 'none';
        
        const originAddress = proposal.origin.address;
        const destAddress = proposal.destination.address;
        const originShort = this.getShortAddress(originAddress);
        const destShort = this.getShortAddress(destAddress);
        const pickupAddress = proposal.pickupPoint?.address || originAddress;
        const pickupShort = this.getShortAddress(pickupAddress);
        const dropoffAddress = proposal.dropoffPoint?.address || destAddress;
        const dropoffShort = this.getShortAddress(dropoffAddress);
        
        const startTime = this.bookingService.formatTime(new Date()); // Now
        const pickupTime = this.bookingService.formatTime(proposal.pickupTime);
        const arrivalTime = this.bookingService.formatTime(proposal.arrivalTime);
        
        const passengers = this.aiAgent.bookingContext.passengers;
        const payment = this.aiAgent.bookingContext.paymentMethod;
        
        // Calculate durations
        const walkToPickupMin = proposal.walkingTime || 5;
        const walkToPickupDist = proposal.walkingDistance || '300m';
        const rideDuration = proposal.duration || 15;
        const walkToDestMin = proposal.walkToDestTime || 1;
        const walkToDestDist = proposal.walkToDestDistance || '60m';
        const totalDuration = walkToPickupMin + rideDuration + walkToDestMin;
        
        // Calculate ETA in minutes from now
        const now = new Date();
        const etaMinutes = Math.round((proposal.pickupTime - now) / 60000);
        
        modalBody.innerHTML = `
            <div id="trip-details-map" class="trip-details-map-full"></div>
            <div class="trip-details-drawer">
                <!-- Trip Summary Header -->
                <div class="trip-summary-header">
                    <div class="trip-eta">
                        <img src="assets/gps.svg" class="trip-eta-icon" alt="ETA">
                        <span class="trip-eta-text">in ${etaMinutes} min</span>
                    </div>
                    <div class="trip-duration">
                        ${totalDuration} min <span class="trip-duration-dot">•</span> Arrive by ${arrivalTime}
                    </div>
                </div>
                
                <!-- Journey Mode Summary -->
                <div class="journey-mode-summary">
                    <span class="journey-mode-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="4" r="2"/>
                            <path d="M14 7h-4l-1 4 3 3v6h2v-7l-2-2.5.5-2.5h1.5l1 2h2v-2h-3z"/>
                        </svg>
                        ${walkToPickupMin}
                    </span>
                    <span class="journey-mode-chevron">›</span>
                    <span class="journey-mode-item">
                        <img src="assets/microtransit.svg" class="journey-mode-icon" alt="Via">
                        <span class="journey-mode-via">VIA</span>
                    </span>
                    <span class="journey-mode-chevron">›</span>
                    <span class="journey-mode-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="4" r="2"/>
                            <path d="M14 7h-4l-1 4 3 3v6h2v-7l-2-2.5.5-2.5h1.5l1 2h2v-2h-3z"/>
                        </svg>
                        ${walkToDestMin}
                    </span>
                </div>
                
                <!-- Journey Legs -->
                <div class="journey-legs">
                    <!-- Start Point (elevated card) -->
                    <div class="journey-card">
                        <div class="journey-card-icon">
                            <div class="journey-start-dot"></div>
                        </div>
                        <div class="journey-card-content">
                            <span class="journey-card-title">Start at ${originShort}</span>
                        </div>
                        <div class="journey-card-time">${startTime}</div>
                    </div>
                    
                    <!-- Walking leg to pickup (surface level) -->
                    <div class="journey-leg-walking">
                        <div class="journey-leg-dots">
                            <span class="dot"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                        </div>
                        <div class="journey-leg-content">
                            <svg class="journey-leg-icon" width="20" height="20" viewBox="0 0 24 24" fill="var(--label-secondary)">
                                <circle cx="12" cy="4" r="2"/>
                                <path d="M14 7h-4l-1 4 3 3v6h2v-7l-2-2.5.5-2.5h1.5l1 2h2v-2h-3z"/>
                            </svg>
                            <div class="journey-leg-text">
                                <span class="journey-leg-title">Walk to ${pickupShort}</span>
                                <span class="journey-leg-detail">${walkToPickupMin} min | ${walkToPickupDist}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Microtransit Ride (elevated card) -->
                    <div class="journey-card journey-card-ride">
                        <div class="journey-card-header">
                            <img src="assets/microtransit.svg" class="journey-ride-icon" alt="Via">
                            <span class="journey-ride-brand">VIA</span>
                            <div class="journey-ride-eta">
                                <img src="assets/gps.svg" class="journey-ride-eta-icon" alt="ETA">
                                <span>${etaMinutes} min</span>
                            </div>
                        </div>
                        <div class="journey-ride-body">
                            <div class="journey-ride-progress">
                                <div class="journey-ride-line"></div>
                                <div class="journey-ride-circle"></div>
                            </div>
                            <div class="journey-ride-details">
                                <div class="journey-ride-pickup">
                                    <span class="journey-ride-label">Pickup from ${pickupShort}</span>
                                </div>
                                <div class="journey-ride-duration">
                                    <span class="journey-ride-duration-text">${rideDuration} min ride</span>
                                    <span class="journey-ride-duration-chevron">^</span>
                                </div>
                                <div class="journey-ride-note">
                                    Your ride may pick up extra passengers, affecting the duration.
                                </div>
                                <div class="journey-ride-dropoff">
                                    <span class="journey-ride-dropoff-label">Dropoff at ${dropoffShort}</span>
                                    <span class="journey-ride-dropoff-time">${this.bookingService.formatTime(new Date(proposal.arrivalTime.getTime() - walkToDestMin * 60000))}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Walking leg to destination (surface level) -->
                    <div class="journey-leg-walking">
                        <div class="journey-leg-dots">
                            <span class="dot"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                        </div>
                        <div class="journey-leg-content">
                            <svg class="journey-leg-icon" width="20" height="20" viewBox="0 0 24 24" fill="var(--label-secondary)">
                                <circle cx="12" cy="4" r="2"/>
                                <path d="M14 7h-4l-1 4 3 3v6h2v-7l-2-2.5.5-2.5h1.5l1 2h2v-2h-3z"/>
                            </svg>
                            <div class="journey-leg-text">
                                <span class="journey-leg-title">Walk to ${destShort}</span>
                                <span class="journey-leg-detail">${walkToDestMin} min | ${walkToDestDist}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Arrive at Destination (elevated card) -->
                    <div class="journey-card">
                        <div class="journey-card-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <rect x="4" y="4" width="16" height="16" rx="2" fill="#374151"/>
                            </svg>
                        </div>
                        <div class="journey-card-content">
                            <span class="journey-card-title">Arrive at ${destShort}</span>
                        </div>
                        <div class="journey-card-time">${arrivalTime}</div>
                    </div>
                </div>
            </div>
            
            <!-- Sticky Footer -->
            <div class="trip-details-footer">
                <div class="trip-details-chips">
                    <button class="chip" id="trip-payment-chip">
                        ${payment.icon}
                        <span>${payment.last4 || payment.name}</span>
                    </button>
                    <button class="chip" id="trip-schedule-chip">
                        <img src="assets/schedule.svg" class="icon-img" alt="Time">
                        <span>${this.formatDatetimeChip(this.aiAgent.bookingContext.datetime)}</span>
                    </button>
                    <button class="chip" id="trip-passengers-chip">
                        <img src="assets/passengers.svg" class="icon-img" alt="Passengers">
                        <span>${passengers}</span>
                    </button>
                </div>
                
                <button class="btn-primary" id="confirm-booking-btn">
                    Book ride | ${CONFIG.pricing.currency}${proposal.price.toFixed(2)}
                </button>
            </div>
        `;
        
        modal.classList.add('active');
        
        // Initialize trip details map
        setTimeout(() => {
            this.initializeTripDetailsMap(proposal);
        }, 100);
        
        // Confirm booking handler
        document.getElementById('confirm-booking-btn').addEventListener('click', () => {
            this.confirmBooking();
        });
        
        // Chip click handlers for modals
        document.getElementById('trip-payment-chip').addEventListener('click', () => {
            this.paymentModal.open(payment);
        });
        
        document.getElementById('trip-schedule-chip').addEventListener('click', () => {
            this.schedulingModal.open(this.aiAgent.bookingContext.datetime);
        });
        
        document.getElementById('trip-passengers-chip').addEventListener('click', () => {
            this.passengersModal.open(passengers);
        });
    }

    /**
     * Initialize map in trip details modal
     */
    initializeTripDetailsMap(proposal) {
        const mapElement = document.getElementById('trip-details-map');
        
        if (!mapElement) return;
        
        if (!window.google || !window.google.maps) {
            // Fallback for no Google Maps with custom markers
            mapElement.style.background = 'linear-gradient(135deg, #e8f4f8 0%, #f0f5f9 50%, #e8ecf0 100%)';
            mapElement.innerHTML = `
                <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
                    <svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.2;">
                        <defs>
                            <pattern id="grid-modal" width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#c8d0d8" stroke-width="1"/>
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid-modal)" />
                        <path d="M 20% 70% Q 50% 50% 80% 30%" stroke="#0069e2" stroke-width="3" fill="none" opacity="0.7" />
                    </svg>
                    <!-- Pickup marker with custom icon -->
                    <img src="assets/pickup_marker.svg" style="position:absolute;bottom:calc(70% - 28px);left:calc(20% - 14px);width:28px;height:28px;" alt="Pickup">
                    <!-- Destination marker with custom icon -->
                    <img src="assets/dropoff_marker.svg" style="position:absolute;top:calc(30% - 28px);right:calc(20% - 14px);width:28px;height:28px;" alt="Dropoff">
                </div>
            `;
            return;
        }
        
        try {
            const origin = proposal.origin;
            const destination = proposal.destination;
            
            // Calculate bounds
            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: origin.lat, lng: origin.lng });
            bounds.extend({ lat: destination.lat, lng: destination.lng });
            
            // Get current theme for map styles
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            
            const map = new google.maps.Map(mapElement, {
                center: bounds.getCenter(),
                zoom: 12,  // Same as proposals
                disableDefaultUI: true,
                styles: getMapStyles(currentTheme)
            });
            
            // Store map reference on element for theme updates
            mapElement._googleMap = map;
            
            // Fit bounds with extra padding to keep arc and address bubbles visible
            map.fitBounds(bounds, { top: 60, right: 50, bottom: 60, left: 50 });
            
            // Origin marker - custom pickup marker
            const originMarker = new google.maps.Marker({
                position: { lat: origin.lat, lng: origin.lng },
                map: map,
                icon: {
                    url: 'assets/pickup_marker.svg',
                    scaledSize: new google.maps.Size(36, 36),
                    anchor: new google.maps.Point(18, 36)
                },
                zIndex: 2
            });
            
            // Origin address label with short address
            const originShortAddr = this.getShortAddress(origin.address);
            const originLabel = new google.maps.InfoWindow({
                content: `<div class="map-address-bubble">${originShortAddr || 'Pickup'}</div>`,
                disableAutoPan: true
            });
            originLabel.open(map, originMarker);
            
            // Destination marker - custom dropoff marker
            const destMarker = new google.maps.Marker({
                position: { lat: destination.lat, lng: destination.lng },
                map: map,
                icon: {
                    url: 'assets/dropoff_marker.svg',
                    scaledSize: new google.maps.Size(36, 36),
                    anchor: new google.maps.Point(18, 36)
                },
                zIndex: 1
            });
            
            // Destination address label with short address
            const destShortAddr = this.getShortAddress(destination.address);
            const destLabel = new google.maps.InfoWindow({
                content: `<div class="map-address-bubble">${destShortAddr || 'Destination'}</div>`,
                disableAutoPan: true
            });
            destLabel.open(map, destMarker);
            
            // Arc between points
            const arcPath = this.calculateArcPath(
                { lat: origin.lat, lng: origin.lng },
                { lat: destination.lat, lng: destination.lng }
            );
            
            new google.maps.Polyline({
                path: arcPath,
                geodesic: false,
                strokeColor: '#0069e2',
                strokeOpacity: 0.7,
                strokeWeight: 3,
                map: map
            });
        } catch (error) {
            console.error('Failed to initialize trip details map:', error);
        }
    }

    /**
     * Calculate arc path between two points
     */
    calculateArcPath(start, end) {
        const points = [];
        const numPoints = 50;
        
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            
            // Linear interpolation
            const lat = start.lat + (end.lat - start.lat) * t;
            const lng = start.lng + (end.lng - start.lng) * t;
            
            // Add very subtle arc (parabolic curve) - much lower to stay fully visible
            const arcHeight = 0.004; // Very low arc that stays within visible bounds
            const arc = Math.sin(t * Math.PI) * arcHeight;
            
            points.push({
                lat: lat + arc,
                lng: lng
            });
        }
        
        return points;
    }

    /**
     * Close modal
     */
    closeModal() {
        const modal = document.getElementById('trip-modal');
        const modalHeader = modal.querySelector('.modal-header');
        modal.classList.remove('active');
        
        // Reset header visibility
        if (modalHeader) {
            modalHeader.style.display = '';
        }
    }

    /**
     * Auto-confirm booking (from AI voice command - skip modal)
     */
    async autoConfirmBooking() {
        // Show booking loading indicator
        this.showTypingIndicator('booking');
        
        // Confirm booking via service
        await this.bookingService.confirmBooking(
            this.selectedProposal,
            this.aiAgent.bookingContext.paymentMethod,
            this.aiAgent.bookingContext.passengers
        );
        
        // Remove booking indicator
        this.removeTypingIndicator();
        
        // Update AI agent state to booking confirmed
        this.aiAgent.currentState = 'BOOKING_CONFIRMED';
        
        // Add confirmation message to chat
        const bookingMsg = 'Booking confirmed! Finding you a driver...';
        this.addMessageToChat('ai', bookingMsg);
        this.aiAgent.speak(bookingMsg);
        
        // Show driver matching indicator
        this.showTypingIndicator('driver');
        
        // Add delay for better UX (5 seconds)
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Find driver
        const driver = await this.bookingService.findDriver();
        this.currentDriver = driver;
        
        // Update AI agent state to driver matched
        this.aiAgent.currentState = 'DRIVER_MATCHED';
        
        // Remove driver indicator
        this.removeTypingIndicator();
        
        // Remove booking summary widget (hide it after driver is matched)
        const bookingSummaryWidget = document.getElementById('booking-summary-widget');
        if (bookingSummaryWidget) {
            bookingSummaryWidget.remove();
        }
        
        // Get actual addresses from selected proposal
        const pickupAddr = this.selectedProposal?.origin?.address || 'your pickup location';
        const destAddr = this.selectedProposal?.destination?.address || 'your destination';
        
        // Add driver matched message with voice feedback
        const driverMsg = `Matched a driver! Your ride is ${driver.eta} minutes away. Your pickup is at ${pickupAddr}, heading to ${destAddr}.`;
        this.addMessageToChat('ai', driverMsg);
        
        // Add driver widget
        this.addDriverWidget(driver);
        
        // Start ETA countdown
        this.startETACountdown();
        
        // Speak the driver message, then offer walking directions after speech ends
        this.aiAgent.speak(driverMsg, () => {
            // Small delay after speech ends before asking about walking directions
            setTimeout(() => {
                this.offerWalkingDirections();
            }, 500);
        });
    }

    /**
     * Confirm booking
     */
    async confirmBooking() {
        const btn = document.getElementById('confirm-booking-btn');
        btn.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
        btn.disabled = true;
        
        // Confirm booking via service
        await this.bookingService.confirmBooking(
            this.selectedProposal,
            this.aiAgent.bookingContext.paymentMethod,
            this.aiAgent.bookingContext.passengers
        );
        
        // Close modal
        this.closeModal();
        
        // Remove proposals and chips from chat
        const chatContainer = document.getElementById('chat-container');
        const carouselContainer = chatContainer.querySelector('.carousel-container');
        const chipsContainer = chatContainer.querySelector('.message-chips');
        
        if (carouselContainer) {
            carouselContainer.remove();
        }
        if (chipsContainer) {
            chipsContainer.remove();
        }
        
        // Update AI agent state to booking confirmed
        this.aiAgent.currentState = 'BOOKING_CONFIRMED';
        
        // Add confirmation message to chat with voice feedback
        const bookingMsg = 'Booking confirmed! Finding you a driver...';
        this.addMessageToChat('ai', bookingMsg);
        this.aiAgent.speak(bookingMsg);
        
        // Show driver matching indicator
        this.showTypingIndicator('driver');
        
        // Add delay for better UX (5 seconds)
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Find driver
        const driver = await this.bookingService.findDriver();
        this.currentDriver = driver;
        
        // Update AI agent state to driver matched
        this.aiAgent.currentState = 'DRIVER_MATCHED';
        
        // Remove driver indicator
        this.removeTypingIndicator();
        
        // Remove booking summary widget (hide it after driver is matched)
        const bookingSummaryWidget = document.getElementById('booking-summary-widget');
        if (bookingSummaryWidget) {
            bookingSummaryWidget.remove();
        }
        
        // Get actual addresses from selected proposal
        const pickupAddr = this.selectedProposal?.origin?.address || 'your pickup location';
        const destAddr = this.selectedProposal?.destination?.address || 'your destination';
        
        // Add driver matched message with voice feedback
        const driverMsg = `Matched a driver! Your ride is ${driver.eta} minutes away. Your pickup is at ${pickupAddr}, heading to ${destAddr}.`;
        this.addMessageToChat('ai', driverMsg);
        
        // Add driver widget
        this.addDriverWidget(driver);
        
        // Start ETA countdown
        this.startETACountdown();
        
        // Speak the driver message, then offer walking directions after speech ends
        this.aiAgent.speak(driverMsg, () => {
            // Small delay after speech ends before asking about walking directions
            setTimeout(() => {
                this.offerWalkingDirections();
            }, 500);
        });
    }

    /**
     * Add booking summary widget to chat
     */
    addBookingSummaryWidget() {
        const chatContainer = document.getElementById('chat-container');
        const proposal = this.selectedProposal;
        const passengers = this.aiAgent.bookingContext.passengers;
        const payment = this.aiAgent.bookingContext.paymentMethod;
        const pickupTime = this.bookingService.formatTime(proposal.pickupTime);
        const now = new Date();
        const isScheduled = proposal.pickupTime - now > 10 * 60000; // More than 10 minutes away
        
        const widget = document.createElement('div');
        widget.className = 'booking-widget';
        widget.id = 'booking-summary-widget';
        widget.innerHTML = `
            <div class="booking-widget-row">
                <img src="assets/gps.svg" class="booking-widget-icon-img" alt="Origin">
                <div class="booking-widget-content">
                    <div class="booking-widget-label">Origin</div>
                    <div class="booking-widget-value">${proposal.origin.address}</div>
                </div>
            </div>
            <div class="booking-widget-row">
                <img src="assets/Group 6.svg" class="booking-widget-icon-img" alt="Destination">
                <div class="booking-widget-content">
                    <div class="booking-widget-label">Destination</div>
                    <div class="booking-widget-value">${proposal.destination.address}</div>
                </div>
            </div>
            ${isScheduled ? `
            <div class="booking-widget-row">
                <img src="assets/schedule.svg" class="booking-widget-icon-img" alt="Time">
                <div class="booking-widget-content">
                    <div class="booking-widget-label">Scheduled for</div>
                    <div class="booking-widget-value">${pickupTime}</div>
                </div>
            </div>
            ` : ''}
            <div class="booking-widget-row">
                <img src="assets/passengers.svg" class="booking-widget-icon-img" alt="Passengers">
                <div class="booking-widget-content">
                    <div class="booking-widget-label">Passengers</div>
                    <div class="booking-widget-value">${passengers} ${passengers === 1 ? 'Passenger' : 'Passengers'}</div>
                </div>
            </div>
            <div class="booking-widget-row">
                ${payment.icon}
                <div class="booking-widget-content">
                    <div class="booking-widget-label">Payment</div>
                    <div class="booking-widget-value">Paying with ${payment.name || payment.type.toUpperCase()}</div>
                </div>
            </div>
        `;
        
        chatContainer.appendChild(widget);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    /**
     * Add driver widget to chat (microtransit card)
     */
    addDriverWidget(driver) {
        const chatContainer = document.getElementById('chat-container');
        const proposal = this.selectedProposal;
        const payment = this.aiAgent.bookingContext.paymentMethod;
        const passengers = this.aiAgent.bookingContext.passengers;
        
        const widget = document.createElement('div');
        widget.className = 'microtransit-card';
        widget.id = 'driver-widget';
        
        const arrivalTime = this.bookingService.formatTime(proposal.arrivalTime);
        const dropoffAddress = this.getShortAddress(proposal.destination.address);
        
        // Payment icon based on type
        let paymentIcon = '<img src="assets/payment_method.svg" class="icon-img" alt="Payment">';
        if (payment.type === 'mastercard') {
            paymentIcon = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="display:inline-block;vertical-align:middle;"><circle cx="6" cy="8" r="5" fill="#EB001B" opacity="0.8"/><circle cx="10" cy="8" r="5" fill="#F79E1B" opacity="0.8"/></svg>';
        }
        
        widget.innerHTML = `
            <div class="microtransit-header">
                <div class="microtransit-header-left">
                    <img src="assets/microtransit.svg" class="microtransit-vehicle-icon" alt="Microtransit">
                    <img src="assets/YRT Logo.png" class="microtransit-logo" alt="YRT">
                </div>
                <div class="microtransit-eta" id="driver-eta">
                    <img src="assets/gps.svg" class="microtransit-eta-icon" alt="ETA">
                    <span>${driver.eta} min</span>
                </div>
            </div>
            
            <div class="microtransit-body">
                <!-- Left column: Progress bar with dropoff circle -->
                <div class="microtransit-progress-column">
                    <div class="microtransit-progress-line"></div>
                    <div class="microtransit-dropoff-circle"></div>
                </div>
                
                <!-- Right column: Driver info and vehicle details -->
                <div class="microtransit-content">
                    <div class="microtransit-driver-section">
                        <img src="assets/Avatar.png" class="microtransit-driver-photo" alt="${driver.name}">
                        <div class="microtransit-driver-info">
                            <div class="microtransit-driver-name">${driver.name}</div>
                            <div class="microtransit-driver-vehicle">${driver.vehicle}</div>
                        </div>
                        <button class="microtransit-call-btn" id="driver-call-btn">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="microtransit-vehicle-details">
                        <div class="microtransit-vehicle-row">Vehicle no. <strong>${driver.vehicleNo}</strong></div>
                        <div class="microtransit-vehicle-row">Plate no. <strong>#${driver.plate}</strong></div>
                    </div>
                    
                    <div class="microtransit-dropoff">
                        <div class="microtransit-dropoff-info">
                            <span class="microtransit-dropoff-label">Dropoff at ${dropoffAddress}</span>
                            <span class="microtransit-dropoff-time">${arrivalTime}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="microtransit-footer">
                <button class="chip" id="ride-payment-chip">
                    <span class="icon">${paymentIcon}</span>
                    <span>${payment.last4 || '4433'}</span>
                </button>
                <button class="chip" id="ride-passengers-chip">
                    <img src="assets/passengers.svg" class="icon-img" alt="Passengers">
                    <span>${passengers}</span>
                </button>
                <button class="microtransit-menu-btn" id="driver-menu-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="6" cy="12" r="2" fill="currentColor"/>
                        <circle cx="12" cy="12" r="2" fill="currentColor"/>
                        <circle cx="18" cy="12" r="2" fill="currentColor"/>
                    </svg>
                </button>
            </div>
        `;
        
        chatContainer.appendChild(widget);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Add menu button handler
        document.getElementById('driver-menu-btn').addEventListener('click', () => {
            this.showCancelRideModal();
        });
        
        // Add chip click handlers for modals
        document.getElementById('ride-payment-chip').addEventListener('click', () => {
            this.paymentModal.open(payment);
        });
        
        document.getElementById('ride-passengers-chip').addEventListener('click', () => {
            this.passengersModal.open(passengers);
        });
    }

    /**
     * Start ETA countdown
     */
    startETACountdown() {
        const etaElement = document.getElementById('driver-eta');
        if (!etaElement) return;
        
        let remainingMinutes = this.currentDriver.eta;
        
        const etaIcon = `<img src="assets/gps.svg" class="microtransit-eta-icon" alt="ETA">`;
        
        const interval = setInterval(() => {
            remainingMinutes--;
            
            if (remainingMinutes <= 0) {
                // Update the ETA display to show "Arrived"
                etaElement.innerHTML = `${etaIcon}<span>Arrived</span>`;
                clearInterval(interval);
                
                // Add follow-up message
                setTimeout(() => {
                    this.addMessageToChat('ai', 'Your ride has arrived! Would you like me to generate walking instructions to the pickup point?');
                    this.aiAgent.speak('Your ride has arrived! Would you like me to generate walking instructions to the pickup point?');
                }, 2000);
            } else {
                etaElement.innerHTML = `${etaIcon}<span>${remainingMinutes} min</span>`;
            }
        }, 60000); // Update every minute (for demo, you might want faster updates)
    }

    /**
     * Show typing indicator with contextual text
     */
    showTypingIndicator(context = 'default') {
        // Play feedback sound
        this.playProcessingSound();
        
        const chatContainer = document.getElementById('chat-container');
        
        // Define contextual messages
        const messages = {
            default: ['Thinking...', 'Analyzing...', 'Processing...'],
            proposals: ['Finding ride options...', 'Checking availability...', 'Loading proposals...'],
            booking: ['Confirming your ride...', 'Processing booking...'],
            modify: ['Updating your preferences...', 'Applying changes...'],
            driver: ['Finding a driver...', 'Matching you with a driver...'],
            walking: ['Getting walking directions...', 'Calculating route...'],
            cancel: ['Cancelling your ride...', 'Processing cancellation...'],
            poi: ['Finding points of interest...', 'Loading places in Arlington...', 'Gathering location data...'],
            recent_rides: ['Loading your ride history...', 'Fetching recent trips...'],
            upcoming_rides: ['Checking your scheduled rides...', 'Loading upcoming trips...']
        };
        
        const contextMessages = messages[context] || messages.default;
        let messageIndex = 0;
        
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.id = 'typing-indicator';
        indicator.innerHTML = `
            <img src="assets/agent%20icon.svg" class="typing-agent-icon" alt="Loading">
            <span class="typing-text">${contextMessages[0]}</span>
        `;
        
        chatContainer.appendChild(indicator);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Cycle through messages if there are multiple
        if (contextMessages.length > 1) {
            this.typingTextInterval = setInterval(() => {
                messageIndex = (messageIndex + 1) % contextMessages.length;
                const textEl = indicator.querySelector('.typing-text');
                if (textEl) {
                    textEl.textContent = contextMessages[messageIndex];
                }
            }, 2000);
        }
    }

    /**
     * Remove typing indicator
     */
    removeTypingIndicator() {
        if (this.typingTextInterval) {
            clearInterval(this.typingTextInterval);
            this.typingTextInterval = null;
        }
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * Show cancel ride modal - now starts the cancellation flow directly
     */
    showCancelRideModal() {
        // Close any open modal
        this.closeModal();
        
        // Start the cancellation flow via AI agent (this will show reasons in chat)
        this.cancelRide();
    }

    /**
     * Cancel ride (called from modal - starts cancellation flow)
     */
    async cancelRide() {
        // Start the cancellation flow via AI agent
        const response = await this.aiAgent.handleCancelRequest();
        this.handleAIResponse(response);
    }

    /**
     * Navigate to screen with smooth transition
     */
    navigateToScreen(screenId) {
        const currentScreenEl = document.querySelector('.screen.active');
        const targetScreen = document.getElementById(`${screenId}-screen`);
        
        if (!targetScreen || (currentScreenEl && currentScreenEl.id === `${screenId}-screen`)) {
            return; // Already on this screen or target doesn't exist
        }
        
        // Determine direction (for animation)
        const screenOrder = ['home', 'agent-voice', 'agent-chat'];
        const currentIndex = currentScreenEl ? screenOrder.indexOf(currentScreenEl.id.replace('-screen', '')) : -1;
        const targetIndex = screenOrder.indexOf(screenId);
        const isForward = targetIndex > currentIndex;
        
        if (currentScreenEl) {
            // Animate out the current screen
            currentScreenEl.classList.add(isForward ? 'transitioning-out' : 'transitioning-out-reverse');
            currentScreenEl.classList.remove('active');
            
            // Clean up after animation
            setTimeout(() => {
                currentScreenEl.classList.remove('transitioning-out', 'transitioning-out-reverse');
            }, 300);
        }
        
        // Animate in the target screen
        targetScreen.classList.add('active');
        targetScreen.classList.add(isForward ? 'transitioning-in' : 'transitioning-in-reverse');
        
        // Clean up after animation
        setTimeout(() => {
            targetScreen.classList.remove('transitioning-in', 'transitioning-in-reverse');
        }, 300);
        
        this.currentScreen = screenId;
    }

    /**
     * Offer walking directions to pickup location
     */
    async offerWalkingDirections() {
        // Show thinking indicator with sound
        this.showTypingIndicator('default');
        
        // Brief delay to show the animation
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        this.removeTypingIndicator();
        
        const offerMsg = "Would you like me to generate walking directions to your pickup location?";
        this.addMessageToChat('ai', offerMsg);
        this.aiAgent.speak(offerMsg);
        
        // Set flag so AI agent knows to handle walking directions response
        this.aiAgent.pendingWalkingDirectionsOffer = true;
    }

    /**
     * Generate and show walking directions
     */
    async showWalkingDirections() {
        if (!this.selectedProposal || !this.selectedProposal.origin) {
            this.addMessageToChat('ai', "I couldn't find your pickup location. Please try again.");
            return;
        }

        this.showTypingIndicator('walking');
        
        try {
            // Get current location and pickup
            const userLocation = CONFIG.mockData.currentLocation;
            const pickup = this.selectedProposal.origin;
            
            // Use Google Maps Directions Service
            const directionsService = new google.maps.DirectionsService();
            
            const request = {
                origin: new google.maps.LatLng(userLocation.lat, userLocation.lng),
                destination: new google.maps.LatLng(pickup.lat, pickup.lng),
                travelMode: google.maps.TravelMode.WALKING
            };
            
            console.log('[Walking Directions] Request:', {
                origin: { lat: userLocation.lat, lng: userLocation.lng },
                destination: { lat: pickup.lat, lng: pickup.lng }
            });
            
            const result = await new Promise((resolve, reject) => {
                directionsService.route(request, (result, status) => {
                    console.log('[Walking Directions] Response status:', status);
                    if (status === 'OK') {
                        resolve(result);
                    } else {
                        // Provide more helpful error messages
                        let errorMsg = `Directions request failed: ${status}`;
                        if (status === 'REQUEST_DENIED') {
                            errorMsg += ' - Directions API may not be enabled in Google Cloud Console';
                        } else if (status === 'ZERO_RESULTS') {
                            errorMsg += ' - No walking route found between these locations';
                        }
                        reject(new Error(errorMsg));
                    }
                });
            });
            
            this.removeTypingIndicator();
            
            // Extract walking instructions
            const route = result.routes[0];
            const leg = route.legs[0];
            const steps = leg.steps;
            
            // Format instructions
            let instructions = `**Walking directions to pickup** (${leg.distance.text}, about ${leg.duration.text})\n\n`;
            
            steps.forEach((step, index) => {
                // Clean HTML from instructions
                const cleanInstruction = step.instructions.replace(/<[^>]*>/g, '');
                instructions += `${index + 1}. ${cleanInstruction} (${step.distance.text})\n`;
            });
            
            // Store directions for map view
            this.walkingDirections = result;
            
            // Add message with instructions
            this.addMessageToChat('ai', instructions);
            this.aiAgent.speak(`Here are your walking directions. It's ${leg.distance.text}, about ${leg.duration.text}.`);
            
            // Add "View on Map" button
            this.addWalkingMapButton();
            
        } catch (error) {
            console.error('[Walking Directions] Error:', error.message);
            if (error.message.includes('REQUEST_DENIED')) {
                console.error('[Walking Directions] To fix: Enable "Directions API" in Google Cloud Console for your API key');
            }
            this.removeTypingIndicator();
            
            // Fallback with basic directions
            const pickup = this.selectedProposal.origin;
            const fallbackMsg = `Your pickup is at ${pickup.address}. Head there and look for your driver - a ${this.currentDriver?.vehicle || 'white van'}.`;
            this.addMessageToChat('ai', fallbackMsg);
            this.aiAgent.speak(fallbackMsg);
            this.addWalkingMapButton();
        }
    }

    /**
     * Add "View on Map" button for walking directions
     */
    addWalkingMapButton() {
        const chatContainer = document.getElementById('chat-container');
        
        const buttonWrapper = document.createElement('div');
        buttonWrapper.className = 'walking-map-button-wrapper';
        buttonWrapper.innerHTML = `
            <button class="btn-secondary walking-map-btn" id="view-walking-map-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                View on Map
            </button>
        `;
        
        chatContainer.appendChild(buttonWrapper);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Add click handler
        document.getElementById('view-walking-map-btn').addEventListener('click', () => {
            this.openWalkingMapView();
        });
    }

    /**
     * Open map view showing walking route to pickup
     */
    openWalkingMapView() {
        const modal = document.getElementById('trip-modal');
        const modalHeader = modal.querySelector('.modal-header h2');
        const modalBody = document.getElementById('modal-body');
        
        modalHeader.textContent = 'Walking to Pickup';
        
        modalBody.innerHTML = `
            <div class="walking-map-container" id="walking-map" style="width: 100%; height: 300px; border-radius: 12px; margin-bottom: 16px;"></div>
            <div class="walking-details" id="walking-details" style="padding: 12px 0;">
                <p style="font-size: var(--body-regular-size); color: var(--label-secondary);">Loading directions...</p>
            </div>
        `;
        
        modal.classList.add('active');
        
        // Initialize the walking map after modal is visible
        setTimeout(() => {
            this.initializeWalkingMap();
        }, 100);
    }

    /**
     * Initialize map with walking route
     */
    initializeWalkingMap() {
        const mapContainer = document.getElementById('walking-map');
        const detailsContainer = document.getElementById('walking-details');
        
        if (!mapContainer) return;
        
        const userLocation = CONFIG.mockData.currentLocation;
        const pickup = this.selectedProposal.origin;
        
        // Create map
        // Get current theme for map styles
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        
        const map = new google.maps.Map(mapContainer, {
            zoom: 16,
            center: { lat: userLocation.lat, lng: userLocation.lng },
            disableDefaultUI: true,
            zoomControl: true,
            styles: getMapStyles(currentTheme)
        });
        
        // Add user location marker
        new google.maps.Marker({
            position: { lat: userLocation.lat, lng: userLocation.lng },
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#007AFF',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2
            },
            title: 'Your Location'
        });
        
        // Add pickup marker
        new google.maps.Marker({
            position: { lat: pickup.lat, lng: pickup.lng },
            map: map,
            icon: {
                url: 'assets/pickup.svg',
                scaledSize: new google.maps.Size(32, 32),
                anchor: new google.maps.Point(16, 32)
            },
            title: 'Pickup Location'
        });
        
        // Draw walking route if we have directions
        if (this.walkingDirections) {
            const directionsRenderer = new google.maps.DirectionsRenderer({
                map: map,
                directions: this.walkingDirections,
                suppressMarkers: true,
                polylineOptions: {
                    strokeColor: '#007AFF',
                    strokeWeight: 4,
                    strokeOpacity: 0.8
                }
            });
            
            // Fit bounds to show entire route
            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: userLocation.lat, lng: userLocation.lng });
            bounds.extend({ lat: pickup.lat, lng: pickup.lng });
            map.fitBounds(bounds, { padding: 50 });
            
            // Update details
            const leg = this.walkingDirections.routes[0].legs[0];
            detailsContainer.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--label-primary);">Distance</span>
                    <span style="color: var(--label-secondary);">${leg.distance.text}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; color: var(--label-primary);">Walking time</span>
                    <span style="color: var(--label-secondary);">${leg.duration.text}</span>
                </div>
            `;
        } else {
            // Just show markers and fit bounds
            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: userLocation.lat, lng: userLocation.lng });
            bounds.extend({ lat: pickup.lat, lng: pickup.lng });
            map.fitBounds(bounds, { padding: 50 });
            
            detailsContainer.innerHTML = `
                <p style="font-size: var(--body-regular-size); color: var(--label-secondary);">
                    Walk to the pickup marker shown on the map.
                </p>
            `;
        }
    }

    /**
     * Utility delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Scroll chat container to bottom
     */
    scrollToBottom() {
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    /**
     * Clear chat history when returning to voice screen
     */
    clearChatHistory() {
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
            chatContainer.innerHTML = '';
        }
    }
}

// Google Maps callback
window.initMap = function() {
    console.log('Google Maps loaded');
    if (window.app && CONFIG.features.googleMaps) {
        window.app.initializeMap();
    }
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    
    // Try to initialize map if Google is already loaded
    if (window.google && window.google.maps && CONFIG.features.googleMaps) {
        window.app.initializeMap();
    }
    
    // Initialize theme toggle
    initThemeToggle();
    
    // Initialize TTS toggle (browser vs ElevenLabs)
    initTTSToggle();
    
    // Initialize view mode toggle
    initViewToggle();
});

/**
 * Initialize view mode toggle functionality
 */
function initViewToggle() {
    const viewToggle = document.getElementById('view-toggle');
    const appContainer = document.getElementById('app');
    
    if (!viewToggle || !appContainer) return;
    
    const toggleBtns = viewToggle.querySelectorAll('.view-toggle-btn');
    
    // Check for saved preference
    const savedView = localStorage.getItem('view-mode') || 'full';
    appContainer.setAttribute('data-view-mode', savedView);
    
    // Update active button
    toggleBtns.forEach(btn => {
        if (btn.dataset.view === savedView) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Toggle handler
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const viewMode = btn.dataset.view;
            
            // Update app container
            appContainer.setAttribute('data-view-mode', viewMode);
            
            // Update active button
            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Save preference
            localStorage.setItem('view-mode', viewMode);
            
            // Trigger map resize if needed (Google Maps needs to know size changed)
            if (window.google && window.google.maps && window.app && window.app.map) {
                setTimeout(() => {
                    google.maps.event.trigger(window.app.map, 'resize');
                }, 350); // Wait for CSS transition
            }
            
            console.log('[View] Switched to:', viewMode);
        });
    });
}

/**
 * Initialize dark mode toggle functionality
 */
function initThemeToggle() {
    // Get all theme toggle buttons (in-app and demo controls)
    const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
    const demoThemeBtn = document.getElementById('demo-theme-toggle');
    
    // Check for saved preference or system preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Apply initial theme
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (prefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    
    // Common toggle function
    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        console.log('[Theme] Switched to:', newTheme);
        
        // Update map styles when theme changes
        updateMapTheme(newTheme);
    };
    
    // Toggle handler for all in-app theme toggle buttons
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });
    
    // Toggle handler for demo controls theme button
    if (demoThemeBtn) {
        demoThemeBtn.addEventListener('click', toggleTheme);
    }
    
    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // Only auto-switch if user hasn't manually set a preference
        if (!localStorage.getItem('theme')) {
            const newTheme = e.matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            updateMapTheme(newTheme);
        }
    });
}

/**
 * Initialize TTS (Text-to-Speech) toggle functionality
 * Allows switching between browser TTS (default) and ElevenLabs premium TTS
 */
function initTTSToggle() {
    const toggleBtn = document.getElementById('tts-toggle');
    const demoTtsBtn = document.getElementById('demo-tts-toggle');
    
    // Check for saved preference (default: browser TTS)
    const savedPref = localStorage.getItem('tts-premium');
    const isPremium = savedPref === 'true';
    
    // Apply initial state to both buttons
    const applyState = (premium) => {
        if (toggleBtn) {
            if (premium) {
                toggleBtn.classList.add('premium');
            } else {
                toggleBtn.classList.remove('premium');
            }
        }
        if (demoTtsBtn) {
            if (premium) {
                demoTtsBtn.classList.add('premium-active');
            } else {
                demoTtsBtn.classList.remove('premium-active');
            }
        }
        CONFIG.elevenLabs.enabled = premium;
    };
    
    // Apply initial state
    applyState(isPremium);
    
    // Common toggle function
    const toggleTTS = () => {
        const currentlyPremium = CONFIG.elevenLabs.enabled;
        const newState = !currentlyPremium;
        
        applyState(newState);
        localStorage.setItem('tts-premium', newState.toString());
        console.log('[TTS] Switched to:', newState ? 'ElevenLabs (Premium)' : 'Browser (Default)');
    };
    
    // Toggle handler for in-app button
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleTTS);
    }
    
    // Toggle handler for demo controls button
    if (demoTtsBtn) {
        demoTtsBtn.addEventListener('click', toggleTTS);
    }
}

/**
 * Get Google Maps styles based on current theme
 */
function getMapStyles(theme) {
    const lightStyles = [
        {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
        }
    ];
    
    const darkStyles = [
        { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
        {
            featureType: 'administrative.locality',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#d59563' }]
        },
        {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
        },
        {
            featureType: 'poi.park',
            elementType: 'geometry',
            stylers: [{ color: '#263c3f' }]
        },
        {
            featureType: 'poi.park',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#6b9a76' }]
        },
        {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#38414e' }]
        },
        {
            featureType: 'road',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#212a37' }]
        },
        {
            featureType: 'road',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#9ca5b3' }]
        },
        {
            featureType: 'road.highway',
            elementType: 'geometry',
            stylers: [{ color: '#746855' }]
        },
        {
            featureType: 'road.highway',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#1f2835' }]
        },
        {
            featureType: 'road.highway',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#f3d19c' }]
        },
        {
            featureType: 'transit',
            elementType: 'geometry',
            stylers: [{ color: '#2f3948' }]
        },
        {
            featureType: 'transit.station',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#d59563' }]
        },
        {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#17263c' }]
        },
        {
            featureType: 'water',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#515c6d' }]
        },
        {
            featureType: 'water',
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#17263c' }]
        }
    ];
    
    return theme === 'dark' ? darkStyles : lightStyles;
}

/**
 * Update map theme when dark mode is toggled
 */
function updateMapTheme(theme) {
    console.log('[Theme] Attempting to update map styles to:', theme);
    const styles = getMapStyles(theme);
    
    // Update main home map
    if (window.app && window.app.map) {
        window.app.map.setOptions({ styles: styles });
        console.log('[Theme] Main map styles updated to:', theme);
    } else {
        console.log('[Theme] Main map not available');
    }
    
    // Update any dynamically created maps (proposals, active ride, walking directions)
    const allMapElements = document.querySelectorAll('.proposal-map, .active-ride-map, .walking-map-container > div');
    allMapElements.forEach((mapEl, index) => {
        if (mapEl._googleMap) {
            mapEl._googleMap.setOptions({ styles: styles });
            console.log('[Theme] Dynamic map', index, 'updated');
        }
    });
}
