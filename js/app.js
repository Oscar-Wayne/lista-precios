const CONFIG = {
    whatsappNumber: '5218711351671',
    defaultGrams: 100,
    minGrams: 100,
    stepGrams: 50,
    searchDebounceMs: 300,
    toastDurationMs: 3000
};

const presentations = [
    { label: '100g', grams: 100, multiplier: 1 },
    { label: '250g', grams: 250, multiplier: 2.5 },
    { label: '500g', grams: 500, multiplier: 5 },
    { label: '1kg', grams: 1000, multiplier: 10 }
];

const categoryIcons = {
    "Cacahuates": "🥜",
    "Botanas Mixtas": "🍿",
    "Nueces y Frutos Secos": "🌰",
    "Frutas Deshidratadas": "🍇",
    "Gomitas y Dulces": "🍬"
};

let productos = [];
let activeCategory = "Todos";
let searchTerm = "";
let selectedProducts = [];
let priceRange = { min: 0, max: Infinity };
let sortBy = "name-asc";
let searchTimeout = null;

function init() {
    loadThemePreference();
    loadCart();
    loadProducts();
    setupEventListeners();
}

async function loadProducts() {
    try {
        const response = await fetch('data/productos.json');
        if (!response.ok) throw new Error('Failed to load products');
        productos = await response.json();
        renderCategories();
        renderProducts();
        updateCalculator();
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Error al cargar los productos', 'error');
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', function(e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchTerm = e.target.value;
            renderProducts();
        }, CONFIG.searchDebounceMs);
    });

    document.getElementById('priceMin').addEventListener('change', function(e) {
        priceRange.min = parseFloat(e.target.value) || 0;
        renderProducts();
    });

    document.getElementById('priceMax').addEventListener('change', function(e) {
        priceRange.max = parseFloat(e.target.value) || Infinity;
        renderProducts();
    });

    document.getElementById('sortBy').addEventListener('change', function(e) {
        sortBy = e.target.value;
        renderProducts();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const panel = document.getElementById('calculatorPanel');
            if (panel.classList.contains('active')) {
                toggleCalculator();
            }
        }
    });
}

function getCategories() {
    const cats = [...new Set(productos.map(p => p.categoria))];
    return ["Todos", ...cats.sort()];
}

function renderCategories() {
    const categoriesDiv = document.getElementById('categories');
    const categories = getCategories();
    
    categoriesDiv.innerHTML = categories.map(cat => `
        <button class="category-btn ${cat === activeCategory ? 'active' : ''}" 
                onclick="filterByCategory('${cat}')"
                aria-pressed="${cat === activeCategory}"
                role="button"
                tabindex="0">
            ${categoryIcons[cat] || '📦'} ${cat}
        </button>
    `).join('');
}

function filterByCategory(category) {
    activeCategory = category;
    renderCategories();
    renderProducts();
}

function sortProducts(products) {
    const sorted = [...products];
    switch(sortBy) {
        case 'price-asc':
            return sorted.sort((a, b) => a.precio - b.precio);
        case 'price-desc':
            return sorted.sort((a, b) => b.precio - a.precio);
        case 'name-asc':
            return sorted.sort((a, b) => a.producto.localeCompare(b.producto));
        case 'name-desc':
            return sorted.sort((a, b) => b.producto.localeCompare(a.producto));
        default:
            return sorted;
    }
}

function filterByPrice(products) {
    return products.filter(p => p.precio >= priceRange.min && p.precio <= priceRange.max);
}

function toggleProductSelection(producto) {
    const index = selectedProducts.findIndex(p => p.nombre === producto.producto);
    
    if (index === -1) {
        selectedProducts.push({
            nombre: producto.producto,
            precioBase: producto.precio,
            gramos: CONFIG.defaultGrams,
            presentation: '100g',
            total: producto.precio
        });
        saveCart();
        showToast(`${producto.producto} agregado`, 'success');
    } else {
        selectedProducts.splice(index, 1);
        saveCart();
        showToast(`${producto.producto} removido`, 'info');
    }
    
    updateCalculator();
    renderProducts();
}

function updateProductPresentation(index, presentationLabel) {
    const presentation = presentations.find(p => p.label === presentationLabel);
    if (!presentation) return;
    
    selectedProducts[index].presentation = presentationLabel;
    selectedProducts[index].gramos = presentation.grams;
    selectedProducts[index].total = selectedProducts[index].precioBase * presentation.multiplier;
    saveCart();
    updateCalculator();
}

function updateProductWeight(index, gramos) {
    if (gramos < CONFIG.minGrams) {
        gramos = CONFIG.minGrams;
        showToast(`Mínimo ${CONFIG.minGrams}g`, 'error');
    }
    
    selectedProducts[index].gramos = gramos;
    selectedProducts[index].presentation = 'custom';
    selectedProducts[index].total = (selectedProducts[index].precioBase * gramos) / 100;
    saveCart();
    updateCalculator();
}

function removeProduct(index) {
    const productName = selectedProducts[index].nombre;
    selectedProducts.splice(index, 1);
    saveCart();
    updateCalculator();
    renderProducts();
    showToast(`${productName} removido`, 'info');
}

function updateCalculator() {
    const selectedProductsDiv = document.getElementById('selectedProducts');
    const totalItemsDiv = document.getElementById('totalItems');
    const totalFinalSpan = document.getElementById('totalFinal');
    const cartBadge = document.getElementById('cartBadge');

    cartBadge.textContent = selectedProducts.length;

    if (selectedProducts.length === 0) {
        selectedProductsDiv.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;" role="status">No hay productos seleccionados. Haz clic en un producto para agregarlo.</p>';
        totalItemsDiv.innerHTML = '';
        totalFinalSpan.textContent = '$0.00';
        return;
    }

    selectedProductsDiv.innerHTML = selectedProducts.map((p, index) => `
        <div class="selected-product" role="listitem">
            <div class="selected-product-info">
                <div class="selected-product-name">${escapeHtml(p.nombre)}</div>
                <div class="weight-input">
                    <label for="weight-${index}" class="sr-only">Gramos</label>
                    <button onclick="updateProductWeight(${index}, ${p.gramos} - ${CONFIG.stepGrams})" aria-label="Reducir cantidad">-</button>
                    <input type="number" id="weight-${index}" value="${p.gramos}" min="${CONFIG.minGrams}" step="${CONFIG.stepGrams}" 
                           onchange="updateProductWeight(${index}, parseInt(this.value))"
                           aria-label="Cantidad en gramos">
                    <span>g</span>
                    <button onclick="updateProductWeight(${index}, ${p.gramos} + ${CONFIG.stepGrams})" aria-label="Aumentar cantidad">+</button>
                </div>
                <select class="presentation-select" onchange="updateProductPresentation(${index}, this.value)" aria-label="Presentación">
                    ${presentations.map(pres => `
                        <option value="${pres.label}" ${p.presentation === pres.label ? 'selected' : ''}>
                            ${pres.label} - $${(p.precioBase * pres.multiplier).toFixed(2)}
                        </option>
                    `).join('')}
                    <option value="custom" ${p.presentation === 'custom' ? 'selected' : ''}>Personalizado</option>
                </select>
                <div style="color: #667eea; font-weight: bold; margin-top: 5px;">
                    ${p.precioBase.toFixed(2)}/100g × ${p.gramos}g = $${p.total.toFixed(2)}
                </div>
            </div>
            <button class="remove-btn" onclick="removeProduct(${index})" aria-label="Eliminar ${escapeHtml(p.nombre)}">✕</button>
        </div>
    `).join('');

    const totalGramos = selectedProducts.reduce((sum, p) => sum + p.gramos, 0);
    const totalPrecio = selectedProducts.reduce((sum, p) => sum + p.total, 0);

    totalItemsDiv.innerHTML = `
        <div class="total-item">
            <span>Productos:</span>
            <span>${selectedProducts.length}</span>
        </div>
        <div class="total-item">
            <span>Peso Total:</span>
            <span>${totalGramos}g</span>
        </div>
    `;

    totalFinalSpan.textContent = `$${totalPrecio.toFixed(2)}`;
}

function toggleCalculator() {
    const panel = document.getElementById('calculatorPanel');
    panel.classList.toggle('active');
}

function isProductSelected(productName) {
    return selectedProducts.some(p => p.nombre === productName);
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const themeToggle = document.getElementById('themeToggle');
    const isDark = document.body.classList.contains('dark-mode');
    
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    
    localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
}

function loadThemePreference() {
    const darkMode = localStorage.getItem('darkMode');
    const themeToggle = document.getElementById('themeToggle');
    
    if (darkMode === 'enabled') {
        document.body.classList.add('dark-mode');
        themeToggle.textContent = '☀️';
    }
}

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(selectedProducts));
}

function loadCart() {
    const cart = localStorage.getItem('cart');
    if (cart) {
        try {
            selectedProducts = JSON.parse(cart);
        } catch (e) {
            selectedProducts = [];
        }
    }
}

function compartirWhatsApp() {
    if (selectedProducts.length === 0) {
        showToast('Agrega productos a tu pedido primero', 'error');
        return;
    }

    let mensaje = "🛒 *NUEVO PEDIDO*\n\n";
    mensaje += "📦 *Productos:*\n";
    mensaje += "━━━━━━━━━━━━━━━━\n";

    selectedProducts.forEach((p, index) => {
        mensaje += `${index + 1}. ${p.nombre}\n`;
        mensaje += `   • Cantidad: ${p.gramos}g\n`;
        mensaje += `   • Precio: $${p.total.toFixed(2)}\n\n`;
    });

    const totalGramos = selectedProducts.reduce((sum, p) => sum + p.gramos, 0);
    const totalPrecio = selectedProducts.reduce((sum, p) => sum + p.total, 0);

    mensaje += "━━━━━━━━━━━━━━━━\n";
    mensaje += "📊 *Resumen:*\n";
    mensaje += `   • Total productos: ${selectedProducts.length}\n`;
    mensaje += `   • Peso total: ${totalGramos}g\n`;
    mensaje += `   • *TOTAL A PAGAR: $${totalPrecio.toFixed(2)}*\n\n`;
    mensaje += "¡Gracias por tu pedido! 😊";

    const mensajeCodificado = encodeURIComponent(mensaje);
    const urlWhatsApp = `https://wa.me/${CONFIG.whatsappNumber}?text=${mensajeCodificado}`;

    window.open(urlWhatsApp, '_blank');
}

function exportPDF() {
    if (selectedProducts.length === 0) {
        showToast('Agrega productos a tu pedido primero', 'error');
        return;
    }

    const printWindow = window.open('', '_blank');
    const totalGramos = selectedProducts.reduce((sum, p) => sum + p.gramos, 0);
    const totalPrecio = selectedProducts.reduce((sum, p) => sum + p.total, 0);

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Pedido - Lista de Precios</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; }
                h1 { color: #667eea; border-bottom: 3px solid #667eea; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #f8f9fa; font-weight: bold; }
                .total { font-size: 1.5em; font-weight: bold; color: #764ba2; margin-top: 20px; }
                .date { color: #999; font-size: 0.9em; }
            </style>
        </head>
        <body>
            <h1>🛒 Pedido</h1>
            <p class="date">Generado: ${new Date().toLocaleString('es-MX')}</p>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>Precio</th>
                    </tr>
                </thead>
                <tbody>
                    ${selectedProducts.map((p, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${escapeHtml(p.nombre)}</td>
                            <td>${p.gramos}g</td>
                            <td>$${p.total.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="total">
                <p>Total productos: ${selectedProducts.length}</p>
                <p>Peso total: ${totalGramos}g</p>
                <p>TOTAL: $${totalPrecio.toFixed(2)}</p>
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();
    printWindow.print();
    showToast('PDF listo para imprimir/guardar', 'success');
}

function renderProducts() {
    const container = document.getElementById('productsContainer');
    const noResults = document.getElementById('noResults');
    
    let filtered = productos;
    
    if (searchTerm) {
        filtered = filtered.filter(p => 
            p.producto.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
    
    if (activeCategory !== "Todos") {
        filtered = filtered.filter(p => p.categoria === activeCategory);
    }

    filtered = filterByPrice(filtered);
    filtered = sortProducts(filtered);

    if (filtered.length === 0) {
        container.style.display = 'none';
        noResults.style.display = 'block';
        return;
    }

    container.style.display = 'block';
    noResults.style.display = 'none';
    
    const groupedProducts = {};
    filtered.forEach(p => {
        if (!groupedProducts[p.categoria]) {
            groupedProducts[p.categoria] = [];
        }
        groupedProducts[p.categoria].push(p);
    });

    container.innerHTML = Object.keys(groupedProducts).sort().map(categoria => `
        <div class="category-section">
            <h2 class="category-title">
                ${categoryIcons[categoria] || '📦'} ${escapeHtml(categoria)}
            </h2>
            <div class="products-grid">
                ${groupedProducts[categoria].map(p => `
                    <div class="product-card ${isProductSelected(p.producto) ? 'selected' : ''}" 
                         onclick="toggleProductSelection(${escapeJson(p)})"
                         role="button"
                         tabindex="0"
                         aria-pressed="${isProductSelected(p.producto)}"
                         onkeydown="if(event.key==='Enter')toggleProductSelection(${escapeJson(p)})">
                        ${p.imagen && (p.imagen.startsWith('http') || p.imagen.startsWith('//'))
                            ? `<img class="product-image" src="${escapeHtml(p.imagen)}" alt="${escapeHtml(p.producto)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                               <div class="product-image-placeholder" style="display:none;">${p.imagen || '📦'}</div>`
                            : `<div class="product-image-placeholder">${p.imagen || '📦'}</div>`}
                        <div class="product-name">${escapeHtml(p.producto)}</div>
                        <div class="product-info">
                            <div class="product-weight">100g</div>
                            <div class="product-price">$${p.precio.toFixed(2)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `
        <span style="font-size: 1.2em;">${icons[type]}</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, CONFIG.toastDurationMs);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeJson(obj) {
    return JSON.stringify(obj).replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
