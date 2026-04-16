import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  collection,
  addDoc,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  let CURRENT_USER_ID = null;
  onAuthStateChanged(auth, (user) => {
      if (user) {
          CURRENT_USER_ID = user.uid;
      } else {
          window.location.href = 'login.html';
      }
  });

  const form = document.getElementById("multi-step-sell-form");
  const steps = document.querySelectorAll(".form-step");
  const stepperItems = document.querySelectorAll(".step");
  const nextBtn = document.getElementById("next-btn");
  const prevBtn = document.getElementById("prev-btn");
  const submitBtn = document.getElementById("submit-btn");

  // --- 1. Dữ liệu danh mục phụ ---
  const subCategoriesMap = {
    watch: ["Đồng hồ cao cấp", "Đồng hồ vintage", "Đồng hồ thông minh"],
    jewelry: ["Nhẫn", "Dây chuyền", "Vòng tay"],
    art: ["Tranh", "Điêu khắc", "Nhiếp ảnh"],
    antiques: ["Nội thất", "Gốm sứ", "Tiền xu"],
    "classic-car": ["Xe cổ điển", "Xe máy cổ"],
    fashion: ["Túi xách", "Giày", "Quần áo"],
    collectibles: ["Tem", "Thẻ bài", "Đồ chơi"],
    electronics: ["Máy ảnh", "Âm thanh", "Máy tính"],
  };

  let currentStep = 1;

  // --- Logic Xử lý Hình ảnh (Sử dụng URL) ---
  const imageUrlInput = document.getElementById("prod-image-url");
  const previewImg = document.getElementById("prev-img");
  const noImgPlaceholder = document.getElementById("no-image-placeholder");

  imageUrlInput.addEventListener("input", (e) => {
    const url = e.target.value.trim();
    if (url) {
      previewImg.src = url;
      previewImg.onerror = () => {
        previewImg.src = "";
        noImgPlaceholder.classList.add("active");
      };
      noImgPlaceholder.classList.remove("active");
    } else {
      previewImg.src = "";
      noImgPlaceholder.classList.add("active");
    }
  });

  // --- Logic Validation tập trung (chỉ dùng cho Live Preview và Submit cuối cùng) ---
  function updateNextButtonState() {
    // Nút "Tiếp theo" luôn được kích hoạt để cho phép người dùng di chuyển tự do giữa các bước
    nextBtn.disabled = false;
  }

  // --- Điều hướng và Giao diện ---
  function updateStepsUI() {
    steps.forEach((step, idx) => {
      step.classList.toggle("active", idx + 1 === currentStep);
    });
    stepperItems.forEach((item, idx) => {
      item.classList.toggle("active", idx + 1 <= currentStep);
    });

    prevBtn.disabled = currentStep === 1;

    if (currentStep === steps.length) {
      nextBtn.style.display = "none";
      submitBtn.style.display = "block";
    } else {
      nextBtn.style.display = "block";
      submitBtn.style.display = "none";
    }
    updateNextButtonState();
  }

  nextBtn.onclick = () => {
    if (currentStep < steps.length) {
      currentStep++;
      updateStepsUI();
    }
  };
  prevBtn.onclick = () => {
    if (currentStep > 1) {
      currentStep--;
      updateStepsUI();
    }
  };

  // Bước 3: Logic Danh mục
  const mainCatItems = document.querySelectorAll(".main-cats .cat-item");
  const subCatSelect = document.getElementById("prod-category");
  mainCatItems.forEach((item) => {
    item.addEventListener("click", () => {
      mainCatItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      form.dataset.selectedMainCat = item.getAttribute("data-main"); // Lưu key danh mục (vd: watch)
      const mainCatKey = item.getAttribute("data-main");
      const previewBadge = document.getElementById("prev-badge-cat");
      if (previewBadge) previewBadge.innerText = item.innerText;
      const subs = subCategoriesMap[mainCatKey] || [];
      subCatSelect.innerHTML =
        '<option value="" disabled selected>Chọn danh mục phụ...</option>' +
        subs
          .map(
            (sub) => `<option value="${item.innerText}/${sub}">${sub}</option>`,
          )
          .join("");
      updateNextButtonState();
    });
  });
  subCatSelect.addEventListener("change", updateNextButtonState);

  // Bước 4: Logic Thời gian
  document.querySelectorAll('input[name="start-time"]').forEach((rad) => {
    rad.onchange = () => {
      document.getElementById("schedule-container").style.display =
        rad.value === "schedule" ? "block" : "none";
      updateNextButtonState();
    };
  });
  document
    .getElementById("prod-start-datetime")
    ?.addEventListener("input", updateNextButtonState);

  // Bước 5: Logic Vận chuyển
  ["ship-domestic", "ship-international", "ship-pickup"].forEach((id) => {
    document
      .getElementById(id)
      ?.addEventListener("change", updateNextButtonState);
  });

  // Live Preview & Fees
  const liveInputs = [
    "prod-name",
    "prod-desc",
    "prod-brand",
    "prod-year",
    "prod-material",
    "prod-size",
    "prod-docs",
    "prod-price",
    "prod-buynow",
  ];

  liveInputs.forEach((id) => {
    document.getElementById(id)?.addEventListener("input", (e) => {
      const val = e.target.value;
      if (id === "prod-name")
        document.getElementById("prev-title").innerText =
          val || "Tiêu đề sản phẩm";
      if (id === "prod-desc")
        document.getElementById("prev-desc-text").innerText =
          val || "Mô tả chi tiết sẽ hiển thị...";
      if (id === "prod-price") {
        const price = parseInt(val) || 0;
        document.getElementById("prev-price").innerText =
          window.Utils.formatCurrency(price);
        document.getElementById("fee-calc").innerText =
          window.Utils.formatCurrency(price * 0.03);
        document.getElementById("fee-pay").innerText =
          window.Utils.formatCurrency(price * 0.02);
        document.getElementById("total-fee").innerText =
          window.Utils.formatCurrency(price * 0.05);
      }
      updateNextButtonState();
    });
  });

  // --- Gửi dữ liệu lên Firebase ---
  form.onsubmit = async (e) => {
    e.preventDefault();

    // Kiểm tra thông tin cuối cùng trước khi đăng bài
    const validateFinal = () => {
      const imageUrl = document.getElementById("prod-image-url").value.trim();
      if (!imageUrl) {
        alert("Vui lòng nhập link ảnh sản phẩm.");
        return false;
      }

      const name = document.getElementById("prod-name").value.trim();
      const brand = document.getElementById("prod-brand").value.trim();
      const cat = document.getElementById("prod-category").value;

      if (name.length < 10) {
        alert("Tiêu đề bài đăng phải có ít nhất 10 ký tự.");
        return false;
      }
      if (!brand) {
        alert("Vui lòng nhập thương hiệu sản phẩm.");
        return false;
      }
      if (!cat) {
        alert("Vui lòng chọn danh mục phù hợp.");
        return false;
      }

      const price = parseInt(document.getElementById("prod-price").value);
      const buyNow = parseInt(document.getElementById("prod-buynow").value);
      if (!price || price <= 0) {
        alert("Vui lòng nhập giá khởi điểm hợp lệ.");
        return false;
      }
      if (buyNow && buyNow <= price) {
        alert("Giá mua ngay phải lớn hơn giá khởi điểm.");
        return false;
      }

      const domestic = document.getElementById("ship-domestic").checked;
      const international =
        document.getElementById("ship-international").checked;
      const pickup = document.getElementById("ship-pickup").checked;
      if (!domestic && !international && !pickup) {
        alert("Vui lòng chọn ít nhất một phương thức vận chuyển.");
        return false;
      }

      return true;
    };

    if (!validateFinal()) return;

    const price = parseInt(document.getElementById("prod-price").value);
    const weight =
      parseFloat(document.getElementById("prod-weight").value) || 0;
    const loadingModal = document.getElementById("loading-modal");
    const statusMsg = document.getElementById("modal-status-text");
    const subText = document.getElementById("modal-sub-text");

    try {
      submitBtn.disabled = true;
      loadingModal?.classList.add("active");
      if (statusMsg) statusMsg.innerText = "Đang đăng bài...";

      // 1. Tạo đối tượng sản phẩm trực tiếp với URL từ input
      const newProduct = {
        name: document.getElementById("prod-name").value,
        category: form.dataset.selectedMainCat || "all",
        startPrice: price,
        currentPrice: price,
        buyNowPrice:
          parseInt(document.getElementById("prod-buynow").value) || null,
        minIncrement:
          parseInt(document.getElementById("prod-increment").value) || 100000,
        sellerId: CURRENT_USER_ID,
        imageUrl: document.getElementById("prod-image-url").value.trim(),
        description: document.getElementById("prod-desc").value,
        timeRemainingSeconds:
          parseInt(document.getElementById("prod-duration").value) * 86400,
        condition: document.querySelector('input[name="condition"]:checked')?.value || 'Không xác định',
        brand: document.getElementById("prod-brand").value,
        year: document.getElementById("prod-year").value,
        material: document.getElementById("prod-material").value,
        size: document.getElementById("prod-size").value,
        docs: document.getElementById("prod-docs").value,
        autoExtend: document.getElementById("prod-auto-extend").checked,
        weight: weight,
        auctionStart: document.querySelector('input[name="start-time"]:checked')?.value || 'now',
        scheduledAt:
          document.getElementById("prod-start-datetime").value || null,
        shipping: {
          domestic: document.getElementById("ship-domestic").checked,
          international: document.getElementById("ship-international").checked,
          pickup: document.getElementById("ship-pickup").checked,
        },
        history: [],
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "products"), newProduct);

      // Cập nhật giao diện Modal sang trạng thái thành công
      const modalContent = loadingModal.querySelector(".modal-content");
      const spinner = loadingModal.querySelector(".spinner");
      const successIcon = loadingModal.querySelector(".success-icon");

      if (spinner) spinner.style.display = "none";
      if (successIcon) successIcon.style.display = "block";
      if (modalContent) modalContent.classList.add("success-state");
      if (statusMsg) statusMsg.innerText = "Đăng bài thành công!";
      if (subText)
        subText.innerText =
          "Sản phẩm của bạn đã được đưa lên sàn đấu giá. Đang chuyển hướng về trang chủ...";

      // Đợi 2.5 giây để người dùng thấy thông báo thành công rồi mới chuyển hướng
      setTimeout(() => {
        window.location.href = "index.html";
      }, 2500);
    } catch (error) {
      console.error("Lỗi đăng sản phẩm:", error);
      if (loadingModal) loadingModal.classList.remove("active");
      alert("Có lỗi xảy ra, vui lòng thử lại!");
      submitBtn.disabled = false;
    }
  };

  updateStepsUI();
});
