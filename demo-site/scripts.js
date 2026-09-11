const customers = [
    { id: 'CUST-100', name: 'Alpha Corp', company: 'Alpha Corp', status: 'Active' },
    { id: 'CUST-101', name: 'Beta Labs', company: 'Beta Labs', status: 'Inactive' },
    { id: 'CUST-102', name: 'Gamma Tech', company: 'Gamma Tech', status: 'Active' },
    { id: 'CUST-103', name: 'Delta Dynamics', company: 'Delta Dynamics', status: 'Active' },
    { id: 'CUST-104', name: 'Epsilon Enterprises', company: 'Epsilon Enterprises', status: 'Active' },
    { id: 'CUST-105', name: 'Zeta Solutions', company: 'Zeta Solutions', status: 'Inactive' },
];

const invoices = [
    { id: 'INV-2026-001', customer: 'Alpha Corp', amount: '₹12,500', date: '2026-09-01', status: 'Paid' },
    { id: 'INV-2026-002', customer: 'Beta Labs', amount: '₹45,000', date: '2026-09-02', status: 'Overdue' },
    { id: 'INV-2026-003', customer: 'Gamma Tech', amount: '₹8,200', date: '2026-09-05', status: 'Paid' },
    { id: 'INV-2026-004', customer: 'Delta Dynamics', amount: '₹1,50,000', date: '2026-09-08', status: 'Pending' },
    { id: 'INV-2026-005', customer: 'Gamma Tech', amount: '₹34,000', date: '2026-09-09', status: 'Pending' },
    { id: 'INV-2026-006', customer: 'Zeta Solutions', amount: '₹5,000', date: '2026-09-10', status: 'Pending' }
];

const products = [
    { id: 'PROD-1', name: 'Enterprise Server', price: '₹2,50,000', stock: 12 },
    { id: 'PROD-2', name: 'Developer Laptop', price: '₹1,20,000', stock: 45 },
    { id: 'PROD-3', name: 'Mechanical Keyboard', price: '₹8,500', stock: 150 },
    { id: 'PROD-4', name: '27" 4K Monitor', price: '₹32,000', stock: 30 }
];

let currentCustomerPage = 1;

document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.target.getAttribute('data-target');
            document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            document.getElementById(targetId).style.display = 'block';
            e.target.classList.add('active');
        });
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.target.getAttribute('data-tab');
            const parent = e.target.closest('.view');
            parent.querySelectorAll('.tab-content').forEach(tc => tc.style.display = 'none');
            parent.querySelectorAll('.tab-btn').forEach(tb => tb.classList.remove('active'));
            document.getElementById(targetId).style.display = 'block';
            e.target.classList.add('active');
        });
    });

    renderCustomers();
    renderInvoices();
    renderProducts(products);
});

function renderCustomers() {
    const list = document.getElementById('customer-list');
    list.innerHTML = '';
    const query = document.getElementById('customer-search').value.toLowerCase();
    let filtered = customers.filter(c => c.name.toLowerCase().includes(query) || c.company.toLowerCase().includes(query));
    
    // Pagination (3 per page for demo)
    const perPage = 3;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    if (currentCustomerPage > totalPages) currentCustomerPage = totalPages;
    document.getElementById('customers-page').textContent = `Page ${currentCustomerPage} of ${totalPages}`;
    
    const start = (currentCustomerPage - 1) * perPage;
    const paginated = filtered.slice(start, start + perPage);

    paginated.forEach(c => {
        list.innerHTML += `
            <tr>
                <td>${c.id}</td>
                <td>${c.name}</td>
                <td>${c.company}</td>
                <td><span class="badge ${c.status === 'Active' ? 'badge-success' : 'badge-error'}">${c.status}</span></td>
                <td><button onclick="openCustomerProfile('${c.id}')">View</button></td>
            </tr>
        `;
    });
}

function filterCustomers() {
    currentCustomerPage = 1;
    renderCustomers();
}

function prevPage(type) {
    if (type === 'customers' && currentCustomerPage > 1) {
        currentCustomerPage--;
        renderCustomers();
    }
}

function nextPage(type) {
    if (type === 'customers') {
        const query = document.getElementById('customer-search').value.toLowerCase();
        let filtered = customers.filter(c => c.name.toLowerCase().includes(query));
        if (currentCustomerPage < Math.ceil(filtered.length / 3)) {
            currentCustomerPage++;
            renderCustomers();
        }
    }
}

function renderInvoices() {
    const list = document.getElementById('invoice-list');
    list.innerHTML = '';
    const query = document.getElementById('invoice-search').value.toLowerCase();
    const statusFilter = document.getElementById('invoice-status-filter').value;
    
    let filtered = invoices.filter(inv => {
        const matchesQuery = inv.id.toLowerCase().includes(query) || inv.customer.toLowerCase().includes(query);
        const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
        return matchesQuery && matchesStatus;
    });

    filtered.forEach(inv => {
        let badgeClass = 'badge-pending';
        if (inv.status === 'Paid') badgeClass = 'badge-success';
        if (inv.status === 'Overdue') badgeClass = 'badge-error';
        
        list.innerHTML += `
            <tr>
                <td>${inv.id}</td>
                <td>${inv.customer}</td>
                <td>${inv.amount}</td>
                <td>${inv.date}</td>
                <td><span class="badge ${badgeClass}">${inv.status}</span></td>
                <td>
                    <button onclick="downloadInvoice('${inv.id}')">Download</button>
                    <button onclick="payInvoice('${inv.id}')" ${inv.status === 'Paid' ? 'disabled' : ''}>Pay</button>
                </td>
            </tr>
        `;
    });
}

function filterInvoices() {
    renderInvoices();
}

function downloadInvoice(id) {
    showAlertModal('Download Complete', `Invoice ${id} has been downloaded to your computer.`);
}

function payInvoice(id) {
    showAlertModal('Payment Initiated', `Opening payment gateway for ${id}...`);
}

function openCustomerProfile(id) {
    showAlertModal('Customer Profile', `Loaded profile details for ${id}.`);
}

function renderProducts(items) {
    const list = document.getElementById('product-list');
    list.innerHTML = '';
    items.forEach(p => {
        list.innerHTML += `
            <div class="product-card card">
                <h4>${p.name}</h4>
                <p class="price" style="font-weight:bold">${p.price}</p>
                <p class="stock">In Stock: ${p.stock}</p>
                <button onclick="addToCart('${p.id}')">Add to Cart</button>
            </div>
        `;
    });
}

function searchProducts() {
    const query = document.getElementById('product-search').value.toLowerCase();
    const filtered = products.filter(p => p.name.toLowerCase().includes(query));
    renderProducts(filtered);
}

function addToCart(id) {
    showAlertModal('Added to Cart', `Product ${id} added successfully.`);
}

function saveProfile(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const alertEl = document.getElementById('profile-alert');
    alertEl.textContent = 'Profile successfully updated!';
    alertEl.className = 'alert alert-success';
    alertEl.style.display = 'block';
    
    // Update navbar
    document.getElementById('display-user-name').textContent = formData.get('fullName');
}

function saveSettings(e, type) {
    e.preventDefault();
    const alertEl = document.getElementById(`settings-${type}-alert`);
    alertEl.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} settings saved.`;
    alertEl.className = 'alert alert-success';
    alertEl.style.display = 'block';
}

function submitSupport(e) {
    e.preventDefault();
    const alertEl = document.getElementById('support-alert');
    alertEl.textContent = 'Support ticket submitted. We will contact you soon.';
    alertEl.className = 'alert alert-success';
    alertEl.style.display = 'block';
    e.target.reset();
}

function performGlobalSearch() {
    const query = document.getElementById('global-search-input').value.toLowerCase();
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById('view-search-results').style.display = 'block';
    document.getElementById('search-query-display').textContent = `Showing results for: "${query}"`;
    
    const resultsList = document.getElementById('search-results-list');
    resultsList.innerHTML = '';
    
    let found = 0;
    if (query) {
        customers.forEach(c => {
            if (c.name.toLowerCase().includes(query)) {
                resultsList.innerHTML += `<li>Customer: ${c.name} - <button onclick="openCustomerProfile('${c.id}')">View</button></li>`;
                found++;
            }
        });
        invoices.forEach(i => {
            if (i.id.toLowerCase().includes(query) || i.customer.toLowerCase().includes(query)) {
                resultsList.innerHTML += `<li>Invoice: ${i.id} for ${i.customer} - <button onclick="downloadInvoice('${i.id}')">Download</button></li>`;
                found++;
            }
        });
    }
    
    if (found === 0) {
        resultsList.innerHTML = '<li>No results found.</li>';
    }
}

// Modal Logic
function showAlertModal(title, body) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = body;
    document.getElementById('generic-modal').classList.remove('hidden');
    document.getElementById('generic-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('generic-modal').classList.add('hidden');
    document.getElementById('generic-modal').style.display = 'none';
}
