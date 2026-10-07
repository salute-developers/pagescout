const PRODUCTS = [
    { name: 'Notebook', price: 12 },
    { name: 'Headphones', price: 59 },
    { name: 'Coffee', price: 8 },
];

const cart = new Map();
let discountApplied = false;
let discountController = null;
let legacyDiscountRegistered = false;

const elements = {
    apiHelp: document.querySelector('#api-help'),
    apiMode: document.querySelector('#api-mode'),
    cartList: document.querySelector('#cart-list'),
    cartTotal: document.querySelector('#cart-total'),
    clearCart: document.querySelector('#clear-cart'),
    discountRow: document.querySelector('#discount-row'),
    discountToolToggle: document.querySelector('#discount-tool-toggle'),
    itemCount: document.querySelector('#item-count'),
    productGrid: document.querySelector('#product-grid'),
    registeredTools: document.querySelector('#registered-tools'),
    toolchangeNote: document.querySelector('#toolchange-note'),
    unsupported: document.querySelector('#unsupported'),
};

const detectedApi = (() => {
    if (document.modelContext) {
        return { context: document.modelContext, modern: true };
    }

    if (navigator.modelContext) {
        return { context: navigator.modelContext, modern: false };
    }

    return null;
})();

function productByName(name) {
    return PRODUCTS.find((product) => product.name === name);
}

function cartSnapshot() {
    const items = [...cart.entries()].map(([name, quantity]) => {
        const product = productByName(name);
        const unitPrice = product?.price ?? 0;
        return { name, quantity, unitPrice, subtotal: unitPrice * quantity };
    });
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const total = discountApplied ? subtotal * 0.9 : subtotal;

    return {
        items,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        discountApplied,
        subtotal,
        total: Number(total.toFixed(2)),
        currency: 'USD',
    };
}

function renderCart() {
    const snapshot = cartSnapshot();
    elements.cartList.replaceChildren();

    if (snapshot.items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'cart-empty';
        empty.textContent = 'The cart is empty.';
        elements.cartList.append(empty);
    } else {
        snapshot.items.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'cart-row';

            const description = document.createElement('span');
            const name = document.createElement('strong');
            const detail = document.createElement('small');
            name.textContent = item.name;
            detail.textContent = `${item.quantity} × $${item.unitPrice.toFixed(2)}`;
            description.append(name, detail);

            const subtotal = document.createElement('strong');
            subtotal.textContent = `$${item.subtotal.toFixed(2)}`;
            row.append(description, subtotal);
            elements.cartList.append(row);
        });
    }

    elements.itemCount.textContent = String(snapshot.itemCount);
    elements.cartTotal.textContent = `$${snapshot.total.toFixed(2)}`;
    elements.discountRow.hidden = !snapshot.discountApplied;
}

function addItem(name, quantity) {
    if (!productByName(name)) {
        throw new Error(`Unknown product: ${name}`);
    }

    cart.set(name, (cart.get(name) ?? 0) + quantity);
    renderCart();
    return cartSnapshot();
}

function clearCart() {
    cart.clear();
    discountApplied = false;
    renderCart();
    return cartSnapshot();
}

function applyDiscount(code) {
    if (code !== 'SAVE10') {
        throw new Error('Invalid discount code. Use SAVE10.');
    }

    discountApplied = true;
    renderCart();
    return cartSnapshot();
}

function renderCatalog() {
    PRODUCTS.forEach((product) => {
        const card = document.createElement('article');
        card.className = 'product-card';

        const copy = document.createElement('div');
        const name = document.createElement('h3');
        const price = document.createElement('p');
        name.textContent = product.name;
        price.textContent = `$${product.price.toFixed(2)}`;
        copy.append(name, price);

        const addButton = document.createElement('button');
        addButton.className = 'primary-button';
        addButton.type = 'button';
        addButton.textContent = 'Add one';
        addButton.addEventListener('click', () => {
            addItem(product.name, 1);
        });

        card.append(copy, addButton);
        elements.productGrid.append(card);
    });
}

const baseTools = [
    {
        name: 'get_cart',
        title: 'Get cart',
        description: 'Return the current cart items, quantities, discount state, and total.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async () => cartSnapshot(),
    },
    {
        name: 'add_item',
        title: 'Add a catalog item',
        description: 'Add a deterministic catalog item to the visible cart.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', enum: PRODUCTS.map((product) => product.name) },
                quantity: { type: 'integer', minimum: 1, maximum: 10 },
            },
            required: ['name', 'quantity'],
            additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async ({ name, quantity }) => addItem(name, quantity),
    },
    {
        name: 'clear_cart',
        title: 'Clear cart',
        description: 'Remove every item and any applied discount from the visible cart.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async () => clearCart(),
    },
];

const discountTool = {
    name: 'apply_discount',
    title: 'Apply test discount',
    description: 'Apply the deterministic SAVE10 code to reduce the visible cart total by 10%.',
    inputSchema: {
        type: 'object',
        properties: {
            code: { type: 'string', const: 'SAVE10' },
        },
        required: ['code'],
        additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async ({ code }) => applyDiscount(code),
};

async function setDiscountToolEnabled(enabled) {
    if (!detectedApi) {
        return;
    }

    if (enabled) {
        if (discountController !== null || legacyDiscountRegistered) {
            return;
        }

        if (detectedApi.modern) {
            discountController = new AbortController();
            await detectedApi.context.registerTool(discountTool, {
                signal: discountController.signal,
            });
        } else {
            await detectedApi.context.registerTool(discountTool);
            legacyDiscountRegistered = true;
        }
    } else if (detectedApi.modern) {
        discountController?.abort();
        discountController = null;
    } else if (typeof detectedApi.context.unregisterTool === 'function') {
        detectedApi.context.unregisterTool(discountTool.name);
        legacyDiscountRegistered = false;
    }

    const active = discountController !== null || legacyDiscountRegistered;
    elements.discountToolToggle.textContent = active ? 'Remove discount tool' : 'Expose discount tool';

    const existing = elements.registeredTools.querySelector('[data-dynamic-tool]');
    if (active && existing === null) {
        const item = document.createElement('li');
        item.dataset.dynamicTool = 'true';
        const code = document.createElement('code');
        const hint = document.createElement('span');
        code.textContent = discountTool.name;
        hint.textContent = 'dynamic · requires approval';
        item.append(code, hint);
        elements.registeredTools.append(item);
    } else if (!active) {
        existing?.remove();
    }

    elements.toolchangeNote.textContent = active
        ? 'apply_discount is exposed. Remove it to emit another toolchange event.'
        : 'Use “Expose discount tool” to register apply_discount dynamically.';
}

async function registerWebMcpTools() {
    if (!detectedApi) {
        elements.apiMode.textContent = 'WebMCP unavailable';
        elements.apiHelp.textContent = 'Manual controls only';
        elements.unsupported.hidden = false;
        return;
    }

    try {
        await Promise.all(baseTools.map((tool) => detectedApi.context.registerTool(tool)));
        elements.apiMode.remove();
        elements.apiHelp.textContent = `${baseTools.length} deterministic tools registered`;
        elements.discountToolToggle.disabled = false;
    } catch (error) {
        elements.apiMode.textContent = 'WebMCP registration failed';
        elements.apiHelp.textContent = error instanceof Error ? error.message : String(error);
        elements.unsupported.hidden = false;
    }
}

renderCatalog();
renderCart();
elements.clearCart.addEventListener('click', clearCart);
elements.discountToolToggle.addEventListener('click', () => {
    const active = discountController !== null || legacyDiscountRegistered;
    void setDiscountToolEnabled(!active);
});
void registerWebMcpTools();
