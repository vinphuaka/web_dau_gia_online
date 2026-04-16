// Cấu hình ban đầu
const START_PRICE = 20000000;
let currentBids = Utils.getFromStorage('auction_bids') || [];

const elements = {
    currentPrice: document.getElementById('current-price'),
    bidInput: document.getElementById('bid-input'),
    bidButton: document.getElementById('bid-button'),
    historyList: document.getElementById('bid-history'),
    message: document.getElementById('message')
};

// Khởi tạo hiển thị
function init() {
    const highestBid = currentBids.length > 0 ? currentBids[0].amount : START_PRICE;
    elements.currentPrice.innerText = Utils.formatCurrency(highestBid);
    renderHistory();

    const timer = new AuctionTimer(3600, (timeStr) => {
        document.getElementById('countdown').innerText = timeStr;
    }, () => {
        elements.bidButton.disabled = true;
        elements.message.innerText = "Phiên đấu giá đã kết thúc!";
    });
    timer.start();
}

function renderHistory() {
    elements.historyList.innerHTML = currentBids
        .map(bid => `<li><span>Người dùng ẩn danh</span> <strong>${Utils.formatCurrency(bid.amount)}</strong></li>`)
        .join('');
}

elements.bidButton.addEventListener('click', () => {
    const bidValue = parseInt(elements.bidInput.value);
    const highestBid = currentBids.length > 0 ? currentBids[0].amount : START_PRICE;

    if (isNaN(bidValue) || bidValue <= highestBid) {
        elements.message.innerText = "Giá đặt phải cao hơn giá hiện tại!";
        elements.message.style.color = "red";
        return;
    }

    // Cập nhật dữ liệu
    const newBid = { amount: bidValue, time: new Date().toLocaleTimeString() };
    currentBids.unshift(newBid);
    Utils.saveToStorage('auction_bids', currentBids);

    // Cập nhật UI
    elements.currentPrice.innerText = Utils.formatCurrency(bidValue);
    elements.bidInput.value = '';
    elements.message.innerText = "Đặt giá thành công!";
    elements.message.style.color = "green";
    renderHistory();
});

init();
