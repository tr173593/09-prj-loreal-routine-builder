// Cloudflare Worker for the L'Oréal routine builder
// This worker calls OpenAI with web search enabled and returns:
// - text: the assistant's reply
// - sources: a list of visible citation links

function getOpenAiApiKey() {
  if (
    typeof globalThis.OPENAI_API_KEY_SECRET !== "undefined" &&
    globalThis.OPENAI_API_KEY_SECRET
  ) {
    return globalThis.OPENAI_API_KEY_SECRET;
  }

  if (
    typeof globalThis.OPENAI_API_KEY !== "undefined" &&
    globalThis.OPENAI_API_KEY
  ) {
    return globalThis.OPENAI_API_KEY;
  }

  return "";
}

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST for OpenAI requests." }, 405);
  }

  const openAiApiKey = getOpenAiApiKey();

  if (!openAiApiKey) {
    return jsonResponse(
      {
        error:
          "Missing OpenAI API key in the worker environment. Set OPENAI_API_KEY_SECRET or OPENAI_API_KEY in Cloudflare.",
      },
      500,
    );
  }

  try {
    const body = await request.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!messages.length) {
      return jsonResponse(
        { error: "Missing messages array in request body." },
        400,
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: messages,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return jsonResponse(
        { error: data.error?.message || "OpenAI request failed." },
        response.status,
      );
    }

    const text = data.choices?.[0]?.message?.content || "";
    const sources = extractCitations(data);

    return jsonResponse({ text, sources });
  } catch (error) {
    return jsonResponse(
      { error: error.message || "Unexpected worker error." },
      500,
    );
  }
}

function extractCitations(data) {
  const citationsMap = new Map();

  data.output?.forEach((outputItem) => {
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

  return Array.from(citationsMap.values());
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
