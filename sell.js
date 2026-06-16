import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
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

  // Lấy ID sản phẩm và chế độ từ URL
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');
  const isEditMode = urlParams.get('mode') === 'edit';

  const form = document.getElementById("multi-step-sell-form");
  const formTitle = document.querySelector('.sell-main-content h2');
  const submitBtn = document.getElementById("submit-btn");
  let currentProductData = null;

  // Thiết lập tên nút hiển thị dựa trên chế độ (Tạo mới hay Chỉnh sửa)
  if (isEditMode && submitBtn) {
    submitBtn.innerText = "Cập Nhật Sản Phẩm";
  } else if (submitBtn) {
    submitBtn.innerText = "Hoàn Tất Đăng Bài";
  }

  // --- Logic Xử lý Tags ---
  let productTags = [];
  const tagInput = document.getElementById("tag-input");
  const tagsContainer = document.getElementById("tags-container");
  const addTagBtn = document.getElementById("add-tag-btn");
  const suggestedTagsContainer = document.getElementById("suggested-tags");

  const popularTagsMap = {
    watch: ["rolex", "omega", "vintage", "automatic", "luxury", "hublot", "seiko"],
    jewelry: ["vang-18k", "kim-cuong", "nhan", "day-chuyen", "pnb", "luxury"],
    art: ["tranh-son-dau", "truu-tuong", "hien-dai", "decor", "sculpture", "painting"],
    antiques: ["do-go", "gom-su", "hiem", "the-ky-19", "co-dien", "suu-tam"],
    "classic-car": ["vintage", "original", "restored", "muscle-car", "classic", "ford"],
    fashion: ["tui-xach", "luxury", "brand-new", "limited", "hermes", "louis-vuitton"],
    collectibles: ["limited-edition", "rare", "mint", "the-bai", "toy", "card"],
    electronics: ["camera", "audio", "vintage-tech", "sony", "apple", "gadget"]
  };

  function updateSuggestedTags() {
    if (!suggestedTagsContainer) return;
    const category = form.dataset.selectedMainCat;
    const title = (document.getElementById("prod-name")?.value || "").toLowerCase();
    
    // 1. Lấy tags từ danh mục đã chọn
    let tagsFromCat = category ? (popularTagsMap[category] || []) : [];
    
    // 2. Lấy tags gợi ý từ tiêu đề (tìm trong toàn bộ kho tags hiện có)
    const allSystemTags = Object.values(popularTagsMap).flat();
    const tagsFromTitle = allSystemTags.filter(tag => {
      const normalizedTag = tag.toLowerCase();
      return title.includes(normalizedTag) && normalizedTag.length > 2;
    });
    
    // Gộp, lọc trùng và loại bỏ các tags đã được chọn
    const combinedTags = [...new Set([...tagsFromCat, ...tagsFromTitle])]
      .filter(t => !productTags.includes(t))
      .slice(0, 12);

    if (combinedTags.length === 0) {
      suggestedTagsContainer.innerHTML = "";
      return;
    }
    
    suggestedTagsContainer.innerHTML = '<small style="width: 100%; color: var(--text-muted); margin-bottom: 2px;">Gợi ý cho bạn:</small>' + 
      combinedTags.map(tag => {
        const style = window.Utils.getTagStyle(tag);
        return `
        <span class="suggested-tag" style="cursor: pointer; background: ${style.bg}; color: ${style.text}; padding: 3px 10px; border-radius: 4px; font-size: 0.75rem; border: 1px solid transparent; transition: all 0.2s; opacity: 0.8;">
          + #${tag}
        </span>
        `;
      }).join("");

    suggestedTagsContainer.querySelectorAll(".suggested-tag").forEach(el => {
      el.onclick = () => {
        const tagVal = el.innerText.replace("+ #", "").trim();
        if (!productTags.includes(tagVal)) {
          productTags.push(tagVal);
          renderTagsUI();
          updateSuggestedTags();
        }
      };
    });
  }

  function renderTagsUI() {
    if (!tagsContainer) return;
    tagsContainer.innerHTML = productTags.map((tag, idx) => {
      const style = window.Utils.getTagStyle(tag);
      return `
      <span class="tag-badge" style="background: ${style.bg}; color: ${style.text}; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; display: flex; align-items: center; gap: 5px; font-weight: 500;">
        #${tag} <i class="fa-solid fa-xmark" data-idx="${idx}" style="cursor: pointer; font-size: 0.7rem;"></i>
      </span>
      `;
    }).join("");
  }

  function addTagFromInput() {
    const val = tagInput.value.trim().toLowerCase().replace(/,/g, "").replace(/^#/, "");
    if (val && !productTags.includes(val)) {
      productTags.push(val);
      renderTagsUI();
      updateSuggestedTags();
    }
    tagInput.value = "";
  }

  tagInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTagFromInput();
    }
  });

  addTagBtn?.addEventListener("click", addTagFromInput);

  tagsContainer?.addEventListener("click", (e) => {
    if (e.target.classList.contains("fa-xmark")) {
      productTags.splice(e.target.dataset.idx, 1);
      renderTagsUI();
      updateSuggestedTags();
    }
  });

  // --- Logic Xử lý Hình ảnh (Sử dụng URL) ---
  const imageUrlInput = document.getElementById("prod-image-url");
  const previewImg = document.getElementById("prev-img");
  const noImgPlaceholder = document.getElementById("no-image-placeholder");

  imageUrlInput.addEventListener("input", (e) => {
    const url = e.target.value.trim();
    if (url) {
      previewImg.onerror = () => {
        previewImg.src = "https://placehold.co/300?text=Loi+anh";
        noImgPlaceholder.classList.add("active");
        noImgPlaceholder.innerText = "Link ảnh bị lỗi hoặc sai định dạng";
      };
      previewImg.onload = () => {
        noImgPlaceholder.classList.remove("active");
      };
      // Đặt src sau khi đã khai báo sự kiện onload/onerror để tránh bị lỗi với ảnh Base64 load quá nhanh
      previewImg.src = url;
    } else {
      previewImg.src = "https://placehold.co/300?text=Chua+co+anh";
      noImgPlaceholder.classList.add("active");
      noImgPlaceholder.innerText = "Chưa có ảnh";
    }
  });

  // --- Logic Validation tập trung (chỉ dùng cho Live Preview và Submit cuối cùng) ---
  function updateNextButtonState() {
  }

  // Hàm tính toán và hiển thị thời gian kết thúc dự kiến
  function updateEndTimePreview() {
    const days = parseInt(document.getElementById("prod-days")?.value) || 0;
    const hours = parseInt(document.getElementById("prod-hours")?.value) || 0;
    const startTimeType = document.querySelector('input[name="start-time"]:checked')?.value || 'now';
    let startDate = new Date();

    // Nếu là lên lịch, lấy ngày bắt đầu từ input datetime-local
    if (startTimeType === 'schedule') {
      const scheduleInput = document.getElementById("prod-start-datetime")?.value;
      if (scheduleInput) startDate = new Date(scheduleInput);
    }

    const endDate = new Date(startDate.getTime() + (days * 86400000) + (hours * 3600000));
    const endElem = document.getElementById("prev-end-time");
    
    if (endElem) {
      const options = { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
      endElem.innerText = `Dự kiến kết thúc: ${endDate.toLocaleString('vi-VN', options)}`;
    }
  }

  // Bước 3: Logic Danh mục
  const mainCatItems = document.querySelectorAll(".main-cats .cat-item");
  mainCatItems.forEach((item) => {
    item.addEventListener("click", () => {
      mainCatItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      form.dataset.selectedMainCat = item.getAttribute("data-main"); // Lưu key danh mục (vd: watch)
      const previewBadge = document.getElementById("prev-badge-cat");
      if (previewBadge) previewBadge.innerText = item.innerText;
      updateNextButtonState(); // Cập nhật trạng thái nút sau khi chọn danh mục
      updateSuggestedTags();
      updateNextButtonState();
    });
  });

  // Bước 4: Logic Thời gian
  document.querySelectorAll('input[name="start-time"]').forEach((rad) => {
    rad.onchange = () => {
      document.getElementById("schedule-container").style.display =
        rad.value === "schedule" ? "block" : "none";
      updateEndTimePreview();
    };
  });
  document
    .getElementById("prod-start-datetime")
    ?.addEventListener("input", () => {
      updateEndTimePreview();
    });

  // Bước 5: Logic Vận chuyển
  ["ship-domestic", "ship-international", "ship-pickup"].forEach((id) => {
    document
      .getElementById(id)
      ?.addEventListener("change", updateNextButtonState);
      updateNextButtonState(); // Cập nhật trạng thái nút sau khi thay đổi vận chuyển
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
    "prod-days",
    "prod-hours"
  ]; // Thêm prod-weight vào đây nếu muốn live preview
  const prodWeightInput = document.getElementById("prod-weight");

  liveInputs.forEach((id) => {
    document.getElementById(id)?.addEventListener("input", (e) => {
      // Giới hạn giá trị nhập cho Giờ (0-23) và Ngày (tối thiểu 0)
      if (id === "prod-hours" && e.target.value !== "") {
        const h = parseInt(e.target.value);
        if (h > 23) e.target.value = 23;
        if (h < 0) e.target.value = 0;
      }
      if (id === "prod-days" && e.target.value !== "" && parseInt(e.target.value) < 0) {
        e.target.value = 0;
      }
      const val = e.target.value;
      if (id === "prod-name") {
        document.getElementById("prev-title").innerText = val || "Tiêu đề sản phẩm";
        updateSuggestedTags();
      }
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
      if (id === "prod-buynow") {
        const buyNowPrice = parseInt(val) || 0;
        const startPrice = parseInt(document.getElementById("prod-price").value) || 0;
        const buynowErrorElem = document.getElementById("buynow-error");
        if (buynowErrorElem) {
          if (buyNowPrice > 0 && buyNowPrice <= startPrice) {
            buynowErrorElem.style.display = "block";
          } else {
            buynowErrorElem.style.display = "none";
          }
        }
      }
      if (id === "prod-days" || id === "prod-hours") {
        const d = document.getElementById("prod-days").value || 0;
        const h = document.getElementById("prod-hours").value || 0;
        document.getElementById("prev-timer").innerText = `${d} ngày ${h} giờ`;

        const totalSeconds = (parseInt(d) * 86400) + (parseInt(h) * 3600);
        const errorElem = document.getElementById("duration-error");
        if (errorElem) {
          if (totalSeconds < 3600) {
            errorElem.innerText = "Thời gian đấu giá tối thiểu là 1 tiếng";
            errorElem.style.display = "block";
          } else if (totalSeconds > 2592000) { // 30 ngày = 2,592,000 giây
            errorElem.innerText = "Thời gian đấu giá tối đa là 30 ngày";
            errorElem.style.display = "block";
          } else {
            errorElem.style.display = "none";
          }
        }

        updateEndTimePreview();
      }
      updateNextButtonState();
    });
  });

  prodWeightInput?.addEventListener("input", () => {
    updateNextButtonState(); // Cập nhật trạng thái nút sau khi thay đổi cân nặng
  });

  // --- Gửi dữ liệu lên Firebase ---
  form.onsubmit = async (e) => {
    e.preventDefault();

    // Kiểm tra thông tin cuối cùng trước khi đăng bài
    const validateFinal = () => {
      const imageUrl = document.getElementById("prod-image-url").value.trim();

      if (imageUrl) {
        // Kiểm tra xem input có phải là URL HTTP/HTTPS hợp lệ hoặc chuỗi Base64 không
        const validImageRegex = /^(https?:\/\/.+|data:image\/[a-zA-Z0-9\-\+]+;base64,.*)$/i;
        if (!validImageRegex.test(imageUrl)) {
          alert("Đường dẫn không hợp lệ. Vui lòng nhập một đường dẫn web (http/https) hoặc chuỗi Base64.");
          return false;
        }

        // Giới hạn dung lượng Base64 (Firestore giới hạn mỗi document tối đa 1MB)
        // 900.000 ký tự Base64 tương đương khoảng 675KB, chừa không gian cho các trường dữ liệu khác.
        if (imageUrl.startsWith("data:image/") && imageUrl.length > 900000) {
          alert("Dung lượng ảnh Base64 quá lớn. Vui lòng nén ảnh xuống dưới 700KB hoặc sử dụng link URL thông thường để tiết kiệm dung lượng Firestore.");
          return false;
        }
      }

      const name = document.getElementById("prod-name").value.trim();
      const desc = document.getElementById("prod-desc").value.trim();
      const brand = document.getElementById("prod-brand").value.trim();
      const cat = form.dataset.selectedMainCat;

      if (name.length < 10) {
        alert("Tiêu đề bài đăng phải có ít nhất 10 ký tự.");
        return false;
      }
      if (desc.length < 10) {
        alert("Vui lòng nhập mô tả chi tiết cho sản phẩm.");
        return false;
      }
      if (!brand) {
        alert("Vui lòng nhập thương hiệu sản phẩm.");
        return false;
      }
      
      // Thay đổi: Nếu không chọn danh mục thì bắt buộc phải có ít nhất 1 tag
      if (!cat && productTags.length === 0) {
        alert("Vui lòng chọn danh mục hoặc thêm ít nhất một thẻ (tag) để phân loại sản phẩm.");
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

      // Kiểm tra thời lượng đấu giá tối thiểu (ít nhất 1 tiếng)
      const days = parseInt(document.getElementById("prod-days")?.value) || 0;
      const hours = parseInt(document.getElementById("prod-hours")?.value) || 0;
      const totalSeconds = (days * 86400) + (hours * 3600);
      if (totalSeconds < 3600) {
        alert("Thời gian đấu giá tối thiểu phải từ 1 tiếng trở lên.");
        return false;
      }
      if (totalSeconds > 2592000) {
        alert("Thời gian đấu giá tối đa không được vượt quá 30 ngày.");
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

    let actionMessage = isEditMode ? "Đang cập nhật bài..." : "Đang đăng bài...";
    try {
      submitBtn.disabled = true;
      loadingModal?.classList.add("active");
      if (statusMsg) statusMsg.innerText = actionMessage;

      // 1. Tạo đối tượng sản phẩm trực tiếp với URL từ input
      const newProduct = {
        name: document.getElementById("prod-name").value,
        category: form.dataset.selectedMainCat || "all",
        tags: productTags,
        startPrice: price,
        currentPrice: price,
        buyNowPrice:
          parseInt(document.getElementById("prod-buynow").value) || null,
        minIncrement:
          parseInt(document.getElementById("prod-increment").value) || 100000,
        sellerId: CURRENT_USER_ID,
        imageUrl: document.getElementById("prod-image-url").value.trim() || "https://placehold.co/600x450?text=Chua+co+anh",
        description: document.getElementById("prod-desc").value,
        timeRemainingSeconds: (
          (parseInt(document.getElementById("prod-days").value) || 0) * 86400 +
          (parseInt(document.getElementById("prod-hours").value) || 0) * 3600
        ),
        isArchived: false,
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
        status: isEditMode ? (currentProductData?.status || "active") : "pending",
        history: [],
        // createdAt chỉ được set khi tạo mới, updatedAt khi cập nhật
        createdAt: isEditMode ? currentProductData.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (isEditMode) {
        await updateDoc(doc(db, "products", productId), newProduct);
      } else {
        await addDoc(collection(db, "products"), newProduct);
      }

      // Cập nhật giao diện Modal sang trạng thái thành công
      const modalContent = loadingModal.querySelector(".modal-content");
      const spinner = loadingModal.querySelector(".spinner");
      const successIcon = loadingModal.querySelector(".success-icon");

      if (spinner) spinner.style.display = "none";
      if (successIcon) successIcon.style.display = "block";
      if (modalContent) modalContent.classList.add("success-state");
      if (statusMsg) statusMsg.innerText = isEditMode ? "Cập nhật thành công!" : "Đăng bài thành công!";
      if (subText)
        subText.innerText =
          isEditMode ? "Sản phẩm của bạn đã được cập nhật. Đang chuyển hướng về trang chi tiết..." : "Sản phẩm đã được đăng và đang chờ quản trị viên phê duyệt. Đang chuyển hướng...";

      // Đợi 2.5 giây để người dùng thấy thông báo thành công rồi mới chuyển hướng
      setTimeout(() => {
        window.location.href = isEditMode ? `product-detail.html?id=${productId}` : "index.html";
      }, 2500);
    } catch (error) {
      console.error("Lỗi đăng sản phẩm:", error);
      if (loadingModal) loadingModal.classList.remove("active");
      alert("Có lỗi xảy ra, vui lòng thử lại!");
      submitBtn.disabled = false;
    }
  };

  // --- Hàm nạp dữ liệu sản phẩm cũ vào form khi ở chế độ chỉnh sửa ---
  async function loadProductForEdit(id) {
    if (!id) return;

    // Hiển thị tiêu đề phù hợp
    if (formTitle) formTitle.innerText = "Chỉnh sửa sản phẩm";

    try {
      const docRef = doc(db, "products", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const product = { id: docSnap.id, ...docSnap.data() };
        currentProductData = product; // Lưu lại dữ liệu sản phẩm gốc

        // Kiểm tra quyền sở hữu trước khi điền form
        if (product.sellerId !== CURRENT_USER_ID) {
          alert("Bạn không có quyền chỉnh sửa sản phẩm này!");
          window.location.href = `product-detail.html?id=${id}`;
          return;
        }

        // Bước 1: Hình ảnh
        document.getElementById("prod-image-url").value = product.imageUrl || '';
        imageUrlInput.dispatchEvent(new Event('input')); // Kích hoạt preview

        // Bước 2: Thông tin
        document.getElementById("prod-name").value = product.name || '';
        document.getElementById("prod-desc").value = product.description || '';
        document.getElementById("prod-brand").value = product.brand || '';
        document.getElementById("prod-year").value = product.year || '';
        document.getElementById("prod-material").value = product.material || '';
        document.getElementById("prod-size").value = product.size || '';
        document.getElementById("prod-docs").value = product.docs || '';
        
        // Tình trạng sản phẩm (radio buttons)
        document.querySelectorAll('input[name="condition"]').forEach(radio => {
          if (radio.value === product.condition) {
            radio.checked = true;
          }
        });

        // Bước 3: Danh mục & Tags
        if (product.category) {
          const catItem = document.querySelector(`.main-cats .cat-item[data-main="${product.category}"]`);
          if (catItem) {
            catItem.click(); // Kích hoạt sự kiện click để chọn danh mục và cập nhật preview/suggested tags
          }
        }
        if (product.tags && product.tags.length > 0) {
          productTags = product.tags;
          renderTagsUI();
          updateSuggestedTags();
        }

        // Bước 4: Đấu giá
        document.getElementById("prod-price").value = product.startPrice || '';
        document.getElementById("prod-buynow").value = product.buyNowPrice || '';
        document.getElementById("prod-increment").value = product.minIncrement || '';

        // Thời gian đấu giá
        const totalSeconds = product.timeRemainingSeconds || 0;
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        document.getElementById("prod-days").value = days;
        document.getElementById("prod-hours").value = hours;

        // Thời điểm bắt đầu
        const startTimeRadio = document.querySelector(`input[name="start-time"][value="${product.auctionStart}"]`);
        if (startTimeRadio) {
          startTimeRadio.checked = true;
          startTimeRadio.dispatchEvent(new Event('change')); // Kích hoạt sự kiện change
        }
        if (product.auctionStart === 'schedule' && product.scheduledAt) {
          document.getElementById("prod-start-datetime").value = product.scheduledAt.substring(0, 16); // Format YYYY-MM-DDTHH:MM
        }
        document.getElementById("prod-auto-extend").checked = product.autoExtend || false;

        // Bước 5: Vận chuyển
        document.getElementById("prod-weight").value = product.weight || '';
        if (product.shipping) {
          document.getElementById("ship-domestic").checked = product.shipping.domestic || false;
          document.getElementById("ship-international").checked = product.shipping.international || false;
          document.getElementById("ship-pickup").checked = product.shipping.pickup || false;
        }
        updateEndTimePreview(); // Cập nhật preview thời gian kết thúc
      } else {
        alert("Không tìm thấy sản phẩm để chỉnh sửa!");
        window.location.href = "index.html"; // Chuyển về trang chủ nếu không tìm thấy
      }
    } catch (error) {
      console.error("Lỗi khi tải sản phẩm để chỉnh sửa:", error);
      alert("Có lỗi xảy ra khi tải sản phẩm.");
      window.location.href = "index.html";
    }
  }

  // Khởi tạo form
  if (isEditMode && productId) {
    loadProductForEdit(productId);
  }
  updateEndTimePreview();
});
