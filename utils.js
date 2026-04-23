window.Utils = {
    formatCurrency: (amount) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    },
    
    saveToStorage: (key, data) => {
        localStorage.setItem(key, JSON.stringify(data));
    },

    getFromStorage: (key) => {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    },

    tagColorSchemes: [
        { bg: "#e0f2fe", text: "#0369a1" }, // Sky
        { bg: "#dcfce7", text: "#15803d" }, // Emerald
        { bg: "#f3e8ff", text: "#7e22ce" }, // Purple
        { bg: "#fef3c7", text: "#b45309" }, // Amber
        { bg: "#ffe4e6", text: "#be123c" }, // Rose
        { bg: "#e0e7ff", text: "#4338ca" }, // Indigo
        { bg: "#ffedd5", text: "#9a3412" }, // Orange
    ],

    getTagStyle: function(tag) {
        let hash = 0;
        for (let i = 0; i < tag.length; i++) {
            hash = tag.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % this.tagColorSchemes.length;
        return this.tagColorSchemes[index];
    },

    // Hàm tính toán thời gian thực tế còn lại dựa trên thời điểm tạo và thời điểm hiện tại
    calculateRemainingTime: function(product) {
        const now = Date.now();
        let remaining = 0;
        let isComingSoon = false;

        if (product.auctionStart === 'schedule' && product.scheduledAt) {
            const startTime = new Date(product.scheduledAt).getTime();
            if (now < startTime) {
                remaining = Math.floor((startTime - now) / 1000);
                isComingSoon = true;
            } else {
                const endTime = startTime + (Number(product.timeRemainingSeconds) * 1000);
                remaining = Math.floor((endTime - now) / 1000);
            }
        } else {
            const createdAt = new Date(product.createdAt).getTime();
            const endTime = createdAt + (Number(product.timeRemainingSeconds) * 1000);
            remaining = Math.floor((endTime - now) / 1000);
        }
        return { 
            seconds: Math.max(0, remaining), 
            isComingSoon 
        };
    },

    // Hàm xác định huy chương dựa trên số lượng giao dịch thành công
    getSellerBadge: function(salesCount) {
        if (salesCount >= 50) return { name: "Elite Seller", class: "badge-gold", icon: "fa-crown" };
        if (salesCount >= 20) return { name: "Pro Seller", class: "badge-silver", icon: "fa-medal" };
        if (salesCount >= 5) return { name: "Trusted Seller", class: "badge-bronze", icon: "fa-award" };
        return null;
    }
};

// Lớp hỗ trợ đếm ngược thời gian đấu giá dùng chung cho toàn hệ thống
window.AuctionTimer = class {
    constructor(seconds, onTick, onComplete) {
        this.seconds = Math.max(0, seconds);
        this.onTick = onTick;
        this.onComplete = onComplete;
        this.interval = null;
    }

    start() {
        this.update();
        if (this.seconds <= 0) {
            if (this.onComplete) this.onComplete();
            return;
        }
        this.interval = setInterval(() => {
            this.seconds--;
            this.update();
            if (this.seconds <= 0) {
                this.stop();
                if (this.onComplete) this.onComplete();
            }
        }, 1000);
    }

    update() {
        const h = Math.floor(this.seconds / 3600);
        const m = Math.floor((this.seconds % 3600) / 60);
        const s = this.seconds % 60;
        const timeStr = [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
        if (this.onTick) this.onTick(timeStr);
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
    }
};
