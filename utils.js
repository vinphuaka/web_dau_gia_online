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
    }
};
