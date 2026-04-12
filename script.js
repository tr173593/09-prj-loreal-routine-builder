/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const directionToggle = document.getElementById("directionToggle");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsButton = document.getElementById("clearSelections");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

let allProducts = [];
let visibleProducts = [];
let selectedProducts = [];
const expandedProductIds = new Set();
let hasGeneratedRoutine = false;
const selectedProductsStorageKey = "loreal-selected-product-ids";

const assistantSystemPrompt = `You are a helpful L'Oreal beauty advisor.
You can only answer questions about:
- the generated routine
- skincare, haircare, makeup, fragrance, grooming, and related beauty topics

If a question is unrelated to those topics, politely refuse and ask the user to keep questions beauty-related.
When web results are available, include brief source citations.
Be clear, practical, and concise.`;

let conversationMessages = [
  {
    role: "system",
    content: assistantSystemPrompt,
  },
];

/* Show a starter message in the chat area */
chatWindow.innerHTML = `
  <div class="placeholder-message">Select products, then click Generate Routine.</div>
`;

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category or search to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  if (allProducts.length > 0) {
    return allProducts;
  }

  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products;
  return allProducts;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  visibleProducts = products;

  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card ${
      isProductSelected(product.id) ? "is-selected" : ""
    }" data-id="${product.id}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <button
          type="button"
          class="details-toggle"
          data-id="${product.id}"
          aria-expanded="${expandedProductIds.has(product.id)}"
          aria-controls="product-description-${product.id}"
        >
          ${expandedProductIds.has(product.id) ? "Hide details" : "Show details"}
        </button>
        <p
          id="product-description-${product.id}"
          class="product-description"
          ${expandedProductIds.has(product.id) ? "" : "hidden"}
        >
          ${product.description}
        </p>
      </div>
    </div>
  `,
    )
    .join("");
}

/* Render the selected products section */
function renderSelectedProducts() {
  clearSelectionsButton.disabled = selectedProducts.length === 0;

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML =
      '<p class="selected-empty">No products selected yet.</p>';
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-item" data-id="${product.id}">
        <span>${product.name}</span>
        <button type="button" class="remove-selected" data-id="${product.id}" aria-label="Remove ${product.name}">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    `,
    )
    .join("");
}

function isProductSelected(productId) {
  return selectedProducts.some((product) => product.id === productId);
}

function saveSelectedProductsToStorage() {
  const selectedIds = selectedProducts.map((product) => product.id);
  localStorage.setItem(selectedProductsStorageKey, JSON.stringify(selectedIds));
}

function loadSelectedProductsFromStorage() {
  const storedValue = localStorage.getItem(selectedProductsStorageKey);

  if (!storedValue) {
    selectedProducts = [];
    return;
  }

  try {
    const savedIds = JSON.parse(storedValue);

    if (!Array.isArray(savedIds)) {
      selectedProducts = [];
      return;
    }

    selectedProducts = allProducts.filter((product) =>
      savedIds.includes(product.id),
    );
  } catch (_error) {
    selectedProducts = [];
  }
}

function clearAllSelectedProducts() {
  selectedProducts = [];
  saveSelectedProductsToStorage();
  renderSelectedProducts();

  if (visibleProducts.length > 0) {
    displayProducts(visibleProducts);
  }
}

function toggleProductSelection(productId) {
  const productToToggle = allProducts.find(
    (product) => product.id === productId,
  );

  if (!productToToggle) {
    return;
  }

  if (isProductSelected(productId)) {
    selectedProducts = selectedProducts.filter(
      (product) => product.id !== productId,
    );
  } else {
    selectedProducts.push(productToToggle);
  }

  saveSelectedProductsToStorage();
  renderSelectedProducts();
  displayProducts(visibleProducts);
}

/* Expand or collapse one product description */
function toggleProductDescription(productId) {
  if (expandedProductIds.has(productId)) {
    expandedProductIds.delete(productId);
  } else {
    expandedProductIds.add(productId);
  }

  displayProducts(visibleProducts);
}

/* Read API key from secrets.js with a few beginner-friendly fallback names */
function getOpenAiApiKey() {
  if (typeof OPENAI_API_KEY !== "undefined" && OPENAI_API_KEY) {
    return OPENAI_API_KEY;
  }

  if (typeof apiKey !== "undefined" && apiKey) {
    return apiKey;
  }

  if (typeof window.OPENAI_API_KEY !== "undefined" && window.OPENAI_API_KEY) {
    return window.OPENAI_API_KEY;
  }

  return "";
}

function getWorkerUrl() {
  if (typeof OPENAI_WORKER_URL !== "undefined" && OPENAI_WORKER_URL) {
    return OPENAI_WORKER_URL;
  }

  if (
    typeof window.OPENAI_WORKER_URL !== "undefined" &&
    window.OPENAI_WORKER_URL
  ) {
    return window.OPENAI_WORKER_URL;
  }

  return "";
}

/* Small helper so AI text displays safely in the page */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appendChatMessage(role, content, heading = "") {
  const messageElement = document.createElement("div");
  messageElement.className = `chat-message ${role}-message`;

  const headingHtml = heading ? `<h3>${escapeHtml(heading)}</h3>` : "";
  messageElement.innerHTML = `${headingHtml}<p>${escapeHtml(content).replace(/\n/g, "<br>")}</p>`;

  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function appendChatMessageWithSources(
  role,
  content,
  heading = "",
  sources = [],
) {
  appendChatMessage(role, content, heading);

  if (!sources.length) {
    return;
  }

  const latestMessage = chatWindow.lastElementChild;
  const sourcesContainer = document.createElement("div");
  sourcesContainer.className = "message-sources";
  sourcesContainer.innerHTML = "<h4>Sources</h4>";

  const sourcesList = document.createElement("ul");

  sources.forEach((source) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.title || source.url;
    item.appendChild(link);
    sourcesList.appendChild(item);
  });

  sourcesContainer.appendChild(sourcesList);
  latestMessage.appendChild(sourcesContainer);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function extractUrlCitations(responseData) {
  const citationsMap = new Map();

  responseData.output?.forEach((outputItem) => {
    outputItem.content?.forEach((contentItem) => {
      contentItem.annotations?.forEach((annotation) => {
        if (annotation.type === "url_citation" && annotation.url) {
          citationsMap.set(annotation.url, {
            title: annotation.title || annotation.url,
            url: annotation.url,
          });
        }
      });
    });
  });

  responseData.choices?.forEach((choice) => {
    choice.message?.annotations?.forEach((annotation) => {
      if (annotation.type === "url_citation" && annotation.url) {
        citationsMap.set(annotation.url, {
          title: annotation.title || annotation.url,
          url: annotation.url,
        });
      }
    });
  });

  responseData.sources?.forEach((source) => {
    if (source?.url) {
      citationsMap.set(source.url, {
        title: source.title || source.url,
        url: source.url,
      });
    }
  });

  return Array.from(citationsMap.values());
}

function showChatStatus(message) {
  const statusElement = document.createElement("div");
  statusElement.className = "placeholder-message chat-status";
  statusElement.textContent = message;
  chatWindow.appendChild(statusElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return statusElement;
}

async function callOpenAi(messages) {
  const workerUrl = getWorkerUrl();

  if (workerUrl) {
    const workerResponse = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: messages }),
    });

    const workerData = await workerResponse.json();

    if (!workerResponse.ok) {
      throw new Error(workerData.error || "Cloudflare Worker request failed.");
    }

    const workerText =
      workerData.text ||
      workerData.output_text ||
      workerData.choices?.[0]?.message?.content ||
      "";

    if (!workerText) {
      throw new Error(
        "No response text was returned by the Cloudflare Worker.",
      );
    }

    const workerSources = extractUrlCitations(workerData);

    return {
      text: workerText,
      sources: workerSources,
    };
  }

  const openAiApiKey = getOpenAiApiKey();

  if (!openAiApiKey) {
    throw new Error(
      "Missing OpenAI API key. Add OPENAI_API_KEY to secrets.js.",
    );
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-search-preview",
      input: messages,
      tools: [{ type: "web_search_preview" }],
      temperature: 0.7,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const apiError = data.error?.message || "OpenAI request failed.";
    throw new Error(apiError);
  }

  const assistantText = data.output_text;

  if (!assistantText) {
    throw new Error("No response text was returned by the API.");
  }

  const citations = extractUrlCitations(data);

  return {
    text: assistantText,
    sources: citations,
  };
}

function isBeautyOrRoutineTopic(text) {
  const topicPattern =
    /routine|product|skincare|skin|haircare|hair|makeup|fragrance|grooming|cleanser|moisturizer|serum|sunscreen|foundation|mascara|lipstick|shampoo|conditioner|spf|acne|dry skin|oily skin|sensitive skin/i;
  return topicPattern.test(text);
}

/* Call OpenAI with selected product JSON and return a routine */
async function generateRoutineFromSelectedProducts() {
  if (selectedProducts.length === 0) {
    appendChatMessage(
      "assistant",
      "Please select at least one product first.",
      "Routine Builder",
    );
    return;
  }

  const selectedProductJson = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  const routineRequest = `Create a personalized routine using these selected products: ${JSON.stringify(
    selectedProductJson,
  )}. Include current and practical advice, and cite web sources when useful.`;

  conversationMessages = [
    {
      role: "system",
      content: assistantSystemPrompt,
    },
    {
      role: "user",
      content: routineRequest,
    },
  ];
  hasGeneratedRoutine = false;

  chatWindow.innerHTML = "";
  appendChatMessage(
    "assistant",
    "Generating your personalized routine...",
    "Routine Builder",
  );

  try {
    const routineResponse = await callOpenAi(conversationMessages);
    conversationMessages.push({
      role: "assistant",
      content: routineResponse.text,
    });
    hasGeneratedRoutine = true;

    chatWindow.innerHTML = "";
    appendChatMessageWithSources(
      "assistant",
      routineResponse.text,
      "Your Personalized Routine",
      routineResponse.sources,
    );

    if (routineResponse.sources.length === 0) {
      appendChatMessage(
        "assistant",
        "This reply was generated without live web citations. To show current, real-world links, the upstream worker needs to return sources from a web search-enabled model.",
        "Sources",
      );
    }
  } catch (error) {
    chatWindow.innerHTML = "";
    appendChatMessage("assistant", error.message, "Routine Builder");
  }
}

async function handleFollowUpQuestion(question) {
  if (!hasGeneratedRoutine) {
    appendChatMessage(
      "assistant",
      "Please generate a routine first, then ask follow-up questions.",
      "Routine Builder",
    );
    return;
  }

  if (!isBeautyOrRoutineTopic(question)) {
    appendChatMessage(
      "assistant",
      "I can only help with your routine and beauty-related topics like skincare, haircare, makeup, fragrance, and grooming.",
      "Topic Scope",
    );
    return;
  }

  conversationMessages.push({ role: "user", content: question });
  const loadingElement = showChatStatus("Thinking...");

  try {
    const reply = await callOpenAi(conversationMessages);
    conversationMessages.push({ role: "assistant", content: reply.text });
    loadingElement.remove();
    appendChatMessageWithSources(
      "assistant",
      reply.text,
      "Beauty Advisor",
      reply.sources,
    );

    if (reply.sources.length === 0) {
      appendChatMessage(
        "assistant",
        "No live citations were returned for this answer. If you want visible links in every response, the worker should call a search-enabled OpenAI model and forward its citations.",
        "Sources",
      );
    }
  } catch (error) {
    loadingElement.remove();
    appendChatMessage("assistant", error.message, "Beauty Advisor");
  }
}

/* Filter products by category and search keyword together */
async function applyFilters() {
  const products = await loadProducts();
  const selectedCategory = categoryFilter.value;
  const searchTerm = productSearch.value.trim().toLowerCase();

  if (!selectedCategory && !searchTerm) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category or search to view products
      </div>
    `;
    visibleProducts = [];
    return;
  }

  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      !selectedCategory || product.category === selectedCategory;
    const searchableText =
      `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
    const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
    return matchesCategory && matchesSearch;
  });

  if (filteredProducts.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products matched your filters.
      </div>
    `;
    visibleProducts = [];
    return;
  }

  displayProducts(filteredProducts);
}

function setDirection(direction) {
  document.documentElement.dir = direction;
  directionToggle.textContent = direction === "rtl" ? "LTR" : "RTL";
  directionToggle.setAttribute(
    "aria-pressed",
    direction === "rtl" ? "true" : "false",
  );
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async () => {
  await applyFilters();
});

productSearch.addEventListener("input", async () => {
  await applyFilters();
});

directionToggle.addEventListener("click", () => {
  const nextDirection = document.documentElement.dir === "rtl" ? "ltr" : "rtl";
  setDirection(nextDirection);
});

/* Toggle selected state by clicking any product card */
productsContainer.addEventListener("click", (e) => {
  const detailsButton = e.target.closest(".details-toggle");

  if (detailsButton) {
    const productId = Number(detailsButton.dataset.id);
    toggleProductDescription(productId);
    return;
  }

  const productCard = e.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  const productId = Number(productCard.dataset.id);
  toggleProductSelection(productId);
});

/* Allow users to remove selected products directly from the list */
selectedProductsList.addEventListener("click", (e) => {
  const removeButton = e.target.closest(".remove-selected");

  if (!removeButton) {
    return;
  }

  const productId = Number(removeButton.dataset.id);
  toggleProductSelection(productId);
});

/* Generate a routine from selected products */
generateRoutineButton.addEventListener("click", async () => {
  await generateRoutineFromSelectedProducts();
});

/* Clear all saved selected products */
clearSelectionsButton.addEventListener("click", () => {
  clearAllSelectedProducts();
});

/* Restore saved selected products on page load */
async function initializeSelectedProducts() {
  await loadProducts();
  loadSelectedProductsFromStorage();
  renderSelectedProducts();
}

initializeSelectedProducts();
setDirection(document.documentElement.dir === "rtl" ? "rtl" : "ltr");

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const question = userInput.value.trim();

  if (!question) {
    return;
  }

  appendChatMessage("user", question, "You");
  userInput.value = "";
  handleFollowUpQuestion(question);
});
