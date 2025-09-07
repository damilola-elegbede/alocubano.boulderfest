// Mobile Admin Interface - A Lo Cubano Boulder Fest
// Handles mobile-specific admin interface patterns and interactions
// Follows iOS HIG and Material Design principles for admin workflows

/**
 * Mobile Admin Interface Manager
 * Provides mobile-specific UI patterns for admin dashboard
 */
class MobileAdminInterface {
    constructor() {
        this.isInitialized = false;
        this.isMobile = window.innerWidth <= 768;
        this.drawer = null;
        this.backdrop = null;
        this.currentView = 'dashboard';
        
        // Touch interaction state
        this.touchState = {
            isDrawerOpen: false,
            activeModal: null,
            scrollPosition: 0
        };
        
        // Mobile patterns
        this.patterns = {
            touchTarget: 44, // Minimum touch target size (iOS HIG)
            swipeThreshold: 50, // Swipe gesture threshold
            longPressDelay: 500, // Long press delay
            scrollBuffer: 100 // Scroll buffer for infinite scroll
        };
        
        this.init();
    }
    
    init() {
        if (this.isInitialized || !this.isMobile) {
            return;
        }
        
        this.createMobileElements();
        this.setupEventListeners();
        this.transformDataTables();
        // Bottom nav is created in createMobileElements(); touch interactions are wired in setupEventListeners()
        
        this.isInitialized = true;
        console.log('Mobile admin interface initialized');
    }
    
    /**
     * Create mobile-specific UI elements
     */
    createMobileElements() {
        this.createDrawerToggle();
        this.createMobileDrawer();
        this.createBottomNavigation();
        this.createMobileModals();
    }
    
    /**
     * Create mobile drawer toggle button
     */
    createDrawerToggle() {
        const toggle = document.createElement('button');
        toggle.className = 'mobile-drawer-toggle';
        toggle.setAttribute('aria-label', 'Open admin menu');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = `
            <div class="drawer-icon">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        document.body.appendChild(toggle);
        return toggle;
    }
    
    /**
     * Create mobile slide-in drawer menu
     */
    createMobileDrawer() {
        // Create backdrop
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'drawer-backdrop';
        
        // Create drawer
        this.drawer = document.createElement('nav');
        this.drawer.className = 'mobile-drawer';
        this.drawer.setAttribute('aria-label', 'Admin navigation menu');
        
        this.drawer.innerHTML = `
            <div class="drawer-header mobile-safe-top">
                <h2 class="drawer-title">Admin Portal</h2>
                <p class="drawer-subtitle">A Lo Cubano Boulder Fest</p>
            </div>
            
            <div class="drawer-nav">
                <div class="drawer-nav-section">
                    <h3 class="drawer-nav-title">Dashboard</h3>
                    <a href="#dashboard" class="drawer-nav-item is-active" data-view="dashboard">
                        <span class="drawer-nav-icon">📊</span>
                        Overview
                    </a>
                    <a href="#statistics" class="drawer-nav-item" data-view="statistics">
                        <span class="drawer-nav-icon">📈</span>
                        Statistics
                    </a>
                </div>
                
                <div class="drawer-nav-section">
                    <h3 class="drawer-nav-title">Management</h3>
                    <a href="#registrations" class="drawer-nav-item" data-view="registrations">
                        <span class="drawer-nav-icon">👥</span>
                        Registrations
                    </a>
                    <a href="#checkin" class="drawer-nav-item" data-view="checkin">
                        <span class="drawer-nav-icon">📱</span>
                        Check-in
                    </a>
                    <a href="#tickets" class="drawer-nav-item" data-view="tickets">
                        <span class="drawer-nav-icon">🎫</span>
                        Tickets
                    </a>
                </div>
                
                <div class="drawer-nav-section">
                    <h3 class="drawer-nav-title">Tools</h3>
                    <a href="/admin/analytics" class="drawer-nav-item">
                        <span class="drawer-nav-icon">📊</span>
                        Analytics
                    </a>
                    <button class="drawer-nav-item" onclick="window.mobileAdmin.syncToSheets()">
                        <span class="drawer-nav-icon">📋</span>
                        Sync Sheets
                    </button>
                    <button class="drawer-nav-item" onclick="window.mobileAdmin.exportData()">
                        <span class="drawer-nav-icon">💾</span>
                        Export Data
                    </button>
                </div>
            </div>
            
            <div class="drawer-footer mobile-safe-bottom">
                <div class="drawer-user-info">
                    <div class="drawer-user-avatar">A</div>
                    <div class="drawer-user-details">
                        <p class="drawer-user-name">Admin</p>
                        <p class="drawer-user-role">Festival Admin</p>
                    </div>
                </div>
                <button class="drawer-nav-item" onclick="logout()" style="margin-top: 8px;">
                    <span class="drawer-nav-icon">🚪</span>
                    Sign Out
                </button>
            </div>
        `;
        
        document.body.appendChild(this.backdrop);
        document.body.appendChild(this.drawer);
        
        return this.drawer;
    }
    
    /**
     * Create bottom navigation for key actions
     */
    createBottomNavigation() {
        const bottomNav = document.createElement('nav');
        bottomNav.className = 'mobile-bottom-nav mobile-safe-bottom';
        bottomNav.setAttribute('aria-label', 'Quick admin actions');
        
        bottomNav.innerHTML = `
            <a href="#dashboard" class="bottom-nav-item is-active" data-view="dashboard">
                <span class="bottom-nav-icon">📊</span>
                <span class="bottom-nav-label">Dashboard</span>
            </a>
            <a href="#registrations" class="bottom-nav-item" data-view="registrations">
                <span class="bottom-nav-icon">👥</span>
                <span class="bottom-nav-label">People</span>
                <span class="bottom-nav-badge sr-only">3</span>
            </a>
            <a href="#checkin" class="bottom-nav-item" data-view="checkin">
                <span class="bottom-nav-icon">📱</span>
                <span class="bottom-nav-label">Check-in</span>
            </a>
            <button class="bottom-nav-item" onclick="window.mobileAdmin.openQuickActions()">
                <span class="bottom-nav-icon">⚡</span>
                <span class="bottom-nav-label">Actions</span>
            </button>
        `;
        
        document.body.appendChild(bottomNav);
        return bottomNav;
    }
    
    /**
     * Create mobile modal container
     */
    createMobileModals() {
        const modalContainer = document.createElement('div');
        modalContainer.id = 'mobile-modal-container';
        document.body.appendChild(modalContainer);
        return modalContainer;
    }
    
    /**
     * Setup event listeners for mobile interactions
     */
    setupEventListeners() {
        // Drawer toggle
        const toggle = document.querySelector('.mobile-drawer-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => this.toggleDrawer());
        }
        
        // Drawer backdrop close
        if (this.backdrop) {
            this.backdrop.addEventListener('click', () => this.closeDrawer());
        }
        
        // Navigation items
        document.addEventListener('click', (e) => {
            if (e.target.closest('.drawer-nav-item[data-view]')) {
                const view = e.target.closest('.drawer-nav-item[data-view]').dataset.view;
                this.navigateToView(view);
                this.closeDrawer();
            }
            
            if (e.target.closest('.bottom-nav-item[data-view]')) {
                const view = e.target.closest('.bottom-nav-item[data-view]').dataset.view;
                this.navigateToView(view);
            }
        });
        
        // Swipe gestures
        this.setupSwipeGestures();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Resize handler
        window.addEventListener('resize', () => this.handleResize());
        
        // Long press for context actions
        this.setupLongPressGestures();
    }
    
    /**
     * Transform desktop data tables to mobile card layout
     */
    transformDataTables() {
        const tables = document.querySelectorAll('.data-table');
        
        tables.forEach(table => {
            if (window.innerWidth <= 768) {
                this.tableToCards(table);
            }
        });
    }
    
    /**
     * Convert table to mobile card layout
     */
    tableToCards(table) {
        const rows = table.querySelectorAll('tbody tr');
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
        
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'mobile-data-cards';
        
        rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            const card = this.createDataCard(headers, cells);
            cardsContainer.appendChild(card);
        });
        
        // Replace table with cards on mobile
        if (window.innerWidth <= 768) {
            table.style.display = 'none';
            table.parentNode.insertBefore(cardsContainer, table.nextSibling);
        }
        
        return cardsContainer;
    }
    
    /**
     * Create individual data card from table row
     */
    createDataCard(headers, cells) {
        const card = document.createElement('div');
        card.className = 'mobile-data-card';
        
        // Extract key information
        const ticketId = cells[0]?.textContent.trim();
        const name = cells[1]?.textContent.trim();
        const email = cells[2]?.textContent.trim();
        const type = cells[3]?.textContent.trim();
        const status = cells[4]?.querySelector('.status-badge')?.textContent.trim();
        const statusClass = cells[4]?.querySelector('.status-badge')?.className || '';
        const actions = cells[6]?.innerHTML || '';
        
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <h3 class="card-title">${this.escapeHtml(name || 'Unknown')}</h3>
                    <p class="card-subtitle">${this.escapeHtml(email || '')}</p>
                </div>
                <span class="${statusClass.replace('status-badge', 'card-status')}">${status || 'Unknown'}</span>
            </div>
            
            <div class="card-content">
                <div class="card-field">
                    <span class="card-field-label">Ticket ID</span>
                    <span class="card-field-value">
                        <span class="ticket-id">${this.escapeHtml(ticketId || 'N/A')}</span>
                    </span>
                </div>
                <div class="card-field">
                    <span class="card-field-label">Type</span>
                    <span class="card-field-value">${this.escapeHtml(type || 'N/A')}</span>
                </div>
            </div>
            
            <div class="card-actions">
                ${actions.replace('checkin-btn', 'card-action-btn checkin-btn')}
            </div>
        `;
        
        return card;
    }
    
    /**
     * Setup swipe gestures for mobile navigation
     */
    setupSwipeGestures() {
        let startX, startY, currentX, currentY;
        let isDrawerSwipe = false;
        
        document.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDrawerSwipe = startX < 20; // Edge swipe detection
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (!startX || !startY) return;
            
            currentX = e.touches[0].clientX;
            currentY = e.touches[0].clientY;
            
            const deltaX = currentX - startX;
            const deltaY = currentY - startY;
            
            // Drawer swipe from left edge
            if (isDrawerSwipe && deltaX > this.patterns.swipeThreshold && Math.abs(deltaY) < 100) {
                this.openDrawer();
                isDrawerSwipe = false;
            }
        }, { passive: true });
        
        document.addEventListener('touchend', () => {
            startX = null;
            startY = null;
            currentX = null;
            currentY = null;
            isDrawerSwipe = false;
        }, { passive: true });
    }
    
    /**
     * Setup long press gestures for context actions
     */
    setupLongPressGestures() {
        let pressTimer = null;
        
        document.addEventListener('touchstart', (e) => {
            if (e.target.closest('.mobile-data-card')) {
                pressTimer = setTimeout(() => {
                    this.showContextMenu(e.target.closest('.mobile-data-card'));
                    navigator.vibrate && navigator.vibrate(50); // Haptic feedback
                }, this.patterns.longPressDelay);
            }
        });
        
        document.addEventListener('touchend', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        });
        
        document.addEventListener('touchmove', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        });
    }
    
    /**
     * Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(e) {
        if (e.metaKey || e.ctrlKey) {
            switch(e.key) {
                case 'm':
                    e.preventDefault();
                    this.toggleDrawer();
                    break;
                case 'd':
                    e.preventDefault();
                    this.navigateToView('dashboard');
                    break;
                case 'r':
                    e.preventDefault();
                    this.navigateToView('registrations');
                    break;
                case 'c':
                    e.preventDefault();
                    this.navigateToView('checkin');
                    break;
            }
        }
        
        if (e.key === 'Escape') {
            this.closeDrawer();
            this.closeAllModals();
        }
    }
    
    /**
     * Handle window resize
     */
    handleResize() {
        const wasMobile = this.isMobile;
        this.isMobile = window.innerWidth <= 768;
        
        // Initialize mobile interface if transitioning to mobile
        if (!wasMobile && this.isMobile && !this.isInitialized) {
            this.init();
        }
        
        // Clean up mobile interface if transitioning to desktop
        if (wasMobile && !this.isMobile) {
            this.cleanup();
        }
    }
    
    /**
     * Drawer controls
     */
    toggleDrawer() {
        if (this.touchState.isDrawerOpen) {
            this.closeDrawer();
        } else {
            this.openDrawer();
        }
    }
    
    openDrawer() {
        if (!this.drawer || !this.backdrop) return;
        
        this.drawer.classList.add('is-open');
        this.backdrop.classList.add('is-active');
        this.touchState.isDrawerOpen = true;
        
        const toggle = document.querySelector('.mobile-drawer-toggle');
        if (toggle) {
            toggle.classList.add('is-active');
            toggle.setAttribute('aria-expanded', 'true');
        }
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        
        // Announce to screen readers
        this.announceToScreenReader('Navigation menu opened');
    }
    
    closeDrawer() {
        if (!this.drawer || !this.backdrop) return;
        
        this.drawer.classList.remove('is-open');
        this.backdrop.classList.remove('is-active');
        this.touchState.isDrawerOpen = false;
        
        const toggle = document.querySelector('.mobile-drawer-toggle');
        if (toggle) {
            toggle.classList.remove('is-active');
            toggle.setAttribute('aria-expanded', 'false');
        }
        
        // Restore body scroll
        document.body.style.overflow = '';
        
        // Announce to screen readers
        this.announceToScreenReader('Navigation menu closed');
    }
    
    /**
     * Navigation between views
     */
    navigateToView(view) {
        this.currentView = view;
        
        // Update active states
        document.querySelectorAll('.drawer-nav-item, .bottom-nav-item').forEach(item => {
            item.classList.remove('is-active');
        });
        
        document.querySelectorAll(`[data-view="${view}"]`).forEach(item => {
            item.classList.add('is-active');
        });
        
        // Scroll to section if it exists
        const section = document.querySelector(`#${view}`);
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        // Announce navigation
        this.announceToScreenReader(`Navigated to ${view}`);
    }
    
    /**
     * Show context menu for long press
     */
    showContextMenu(card) {
        const ticketId = card.querySelector('.ticket-id')?.textContent;
        if (!ticketId) return;
        
        const modal = this.createModal('Context Actions', `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <button class="card-action-btn" onclick="window.mobileAdmin.viewTicketDetails('${ticketId}')">
                    📋 View Details
                </button>
                <button class="card-action-btn" onclick="window.mobileAdmin.sendTicketEmail('${ticketId}')">
                    📧 Send Email
                </button>
                <button class="card-action-btn" onclick="window.mobileAdmin.downloadTicket('${ticketId}')">
                    💾 Download
                </button>
                <button class="card-action-btn checkin-btn" onclick="checkinTicket('${ticketId}')">
                    ✅ Check In
                </button>
            </div>
        `);
        
        this.showModal(modal);
    }
    
    /**
     * Quick actions modal
     */
    openQuickActions() {
        const modal = this.createModal('Quick Actions', `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <button class="card-action-btn" onclick="window.mobileAdmin.syncToSheets()">
                    📊 Sync Sheets
                </button>
                <button class="card-action-btn" onclick="window.mobileAdmin.exportData()">
                    💾 Export CSV
                </button>
                <button class="card-action-btn" onclick="window.mobileAdmin.refreshData()">
                    🔄 Refresh
                </button>
                <button class="card-action-btn" onclick="window.mobileAdmin.openScanner()">
                    📱 QR Scanner
                </button>
            </div>
        `);
        
        this.showModal(modal);
    }
    
    /**
     * Modal management
     */
    createModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'mobile-modal';
        modal.innerHTML = `
            <div class="mobile-modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">${this.escapeHtml(title)}</h2>
                    <button class="modal-close" aria-label="Close modal">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;
        
        // Close button handler
        modal.querySelector('.modal-close').addEventListener('click', () => {
            this.closeModal(modal);
        });
        
        // Backdrop close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });
        
        return modal;
    }
    
    showModal(modal) {
        const container = document.getElementById('mobile-modal-container');
        container.appendChild(modal);
        
        // Trigger animation
        setTimeout(() => {
            modal.classList.add('is-active');
        }, 10);
        
        this.touchState.activeModal = modal;
        document.body.style.overflow = 'hidden';
    }
    
    closeModal(modal) {
        modal.classList.remove('is-active');
        
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
        
        if (this.touchState.activeModal === modal) {
            this.touchState.activeModal = null;
        }
        
        document.body.style.overflow = '';
    }
    
    closeAllModals() {
        document.querySelectorAll('.mobile-modal').forEach(modal => {
            this.closeModal(modal);
        });
    }
    
    /**
     * Admin action methods
     */
    async syncToSheets() {
        this.showToast('Syncing to Google Sheets...', 'info');
        try {
            // Use existing sync function
            if (typeof syncToSheets === 'function') {
                await syncToSheets();
                this.showToast('Sync completed successfully!', 'success');
            } else {
                this.showToast('Sync function not available', 'error');
            }
        } catch (error) {
            this.showToast('Sync failed: ' + error.message, 'error');
        }
    }
    
    async exportData() {
        this.showToast('Exporting data...', 'info');
        try {
            // Use existing export function
            if (typeof exportToCSV === 'function') {
                await exportToCSV();
                this.showToast('Data exported successfully!', 'success');
            } else {
                this.showToast('Export function not available', 'error');
            }
        } catch (error) {
            this.showToast('Export failed: ' + error.message, 'error');
        }
    }
    
    async refreshData() {
        this.showToast('Refreshing data...', 'info');
        try {
            // Use existing load functions
            if (typeof loadDashboard === 'function') {
                await loadDashboard();
                this.showToast('Data refreshed!', 'success');
            } else {
                window.location.reload();
            }
        } catch (error) {
            this.showToast('Refresh failed: ' + error.message, 'error');
        }
    }
    
    openScanner() {
        // Navigate to check-in scanner
        window.location.href = '/admin/checkin';
    }
    
    viewTicketDetails(ticketId) {
        this.showToast(`Viewing details for ${ticketId}`, 'info');
        // Implementation would show detailed modal
    }
    
    sendTicketEmail(ticketId) {
        this.showToast(`Sending email for ${ticketId}`, 'info');
        // Implementation would trigger email send
    }
    
    downloadTicket(ticketId) {
        this.showToast(`Downloading ${ticketId}`, 'info');
        // Implementation would trigger download
    }
    
    /**
     * Toast notifications
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `mobile-toast mobile-toast-${type}`;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 16px;
            right: 16px;
            background: ${this.getToastColor(type)};
            color: white;
            padding: 16px;
            border-radius: 8px;
            font-weight: 500;
            z-index: 1200;
            transform: translateY(-100px);
            transition: transform 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        `;
        
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateY(0)';
        }, 10);
        
        // Auto remove
        setTimeout(() => {
            toast.style.transform = 'translateY(-100px)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
        
        return toast;
    }
    
    getToastColor(type) {
        const colors = {
            info: '#3498db',
            success: '#27ae60',
            error: '#e74c3c',
            warning: '#f39c12'
        };
        return colors[type] || colors.info;
    }
    
    /**
     * Accessibility helpers
     */
    announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }
    
    /**
     * Security: HTML escaping
     */
    escapeHtml(unsafe) {
        if (unsafe == null) return "";
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    /**
     * Cleanup mobile interface
     */
    cleanup() {
        // Remove mobile elements
        const elementsToRemove = [
            '.mobile-drawer-toggle',
            '.mobile-drawer',
            '.drawer-backdrop',
            '.mobile-bottom-nav',
            '.mobile-data-cards'
        ];
        
        elementsToRemove.forEach(selector => {
            const element = document.querySelector(selector);
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
        
        // Restore table display
        document.querySelectorAll('.data-table').forEach(table => {
            table.style.display = '';
        });
        
        // Reset body styles
        document.body.style.overflow = '';
        
        this.isInitialized = false;
    }
}

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize on mobile devices
    if (window.innerWidth <= 768) {
        window.mobileAdmin = new MobileAdminInterface();
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile && !window.mobileAdmin) {
        window.mobileAdmin = new MobileAdminInterface();
    } else if (!isMobile && window.mobileAdmin) {
        window.mobileAdmin.cleanup();
        window.mobileAdmin = null;
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MobileAdminInterface;
}