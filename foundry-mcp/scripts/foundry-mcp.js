(() => {
  const MODULE_ID = "foundry-mcp";

  function getSetting(key) {
    return game.settings.get(MODULE_ID, key);
  }

  function getProxyUrl() {
    const value = getSetting("proxyUrl").trim();
    return value.replace(/\/$/, "");
  }

  function getProxyToken() {
    return getSetting("proxyToken").trim();
  }

  async function requestLLM(payload) {
    const proxyUrl = getProxyUrl();
    const proxyToken = getProxyToken();

    if (!proxyUrl) {
      throw new Error("Foundry MCP: proxy URL is not configured.");
    }
    if (!proxyToken) {
      throw new Error("Foundry MCP: proxy token is not configured.");
    }

    const response = await fetch(`${proxyUrl}/v1/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Foundry-Proxy-Token": proxyToken
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Foundry MCP: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  async function ensureCompendium(definition) {
    const { name, label, type, package: pkg = "world" } = definition;
    if (!name || !label || !type) {
      throw new Error("Foundry MCP: compendium requires name, label, and type.");
    }

    const existing = game.packs.get(`${pkg}.${name}`);
    if (existing) return existing;

    return CompendiumCollection.createCompendium({
      name,
      label,
      type,
      package: pkg
    });
  }

  async function createDocument({ type, data, options, pack }) {
    if (!type || !data) {
      throw new Error("Foundry MCP: document requires type and data.");
    }

    if (pack) {
      const targetPack = game.packs.get(pack);
      if (!targetPack) {
        throw new Error(`Foundry MCP: pack not found: ${pack}`);
      }
      return targetPack.documentClass.create(data, {
        ...options,
        pack: targetPack.collection
      });
    }

    const documentConfig = CONFIG[type];
    const documentClass = documentConfig?.documentClass;
    if (!documentClass) {
      throw new Error(`Foundry MCP: unsupported document type: ${type}`);
    }

    return documentClass.create(data, options);
  }

  async function importPayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Foundry MCP: payload must be an object.");
    }

    const compendiums = Array.isArray(payload.compendiums)
      ? payload.compendiums
      : [];
    const documents = Array.isArray(payload.documents)
      ? payload.documents
      : payload.document
        ? [payload.document]
        : [];

    for (const compendium of compendiums) {
      await ensureCompendium(compendium);
    }

    if (!documents.length) {
      ui.notifications.warn("Foundry MCP: no documents to import.");
      return [];
    }

    const created = [];
    for (const doc of documents) {
      created.push(await createDocument(doc));
    }

    ui.notifications.info(`Foundry MCP: imported ${created.length} document(s).`);
    return created;
  }

  class FoundryMCPImportApp extends FormApplication {
    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        id: "foundry-mcp-import",
        title: "Foundry MCP Import",
        template: "modules/foundry-mcp/templates/import-dialog.html",
        width: 520
      });
    }

    async _updateObject(_event, formData) {
      const rawPayload = (formData.payload || "").trim();
      if (!rawPayload) {
        ui.notifications.warn("Foundry MCP: paste JSON payload first.");
        return;
      }

      let payload;
      try {
        payload = JSON.parse(rawPayload);
      } catch (error) {
        ui.notifications.error("Foundry MCP: invalid JSON payload.");
        throw error;
      }

      await importPayload(payload);
    }
  }

  Hooks.once("init", () => {
    game.settings.register(MODULE_ID, "proxyUrl", {
      name: "Proxy URL",
      hint: "Base URL of the MCP proxy service (e.g. https://your-app.up.railway.app).",
      scope: "client",
      config: true,
      type: String,
      default: ""
    });

    game.settings.register(MODULE_ID, "proxyToken", {
      name: "Proxy Token",
      hint: "Shared secret sent in X-Foundry-Proxy-Token.",
      scope: "client",
      config: true,
      type: String,
      default: ""
    });

    game.settings.registerMenu(MODULE_ID, "importMenu", {
      name: "Import JSON",
      label: "Open Import Dialog",
      hint: "Paste JSON payloads from Codex or other tools to create Foundry documents.",
      icon: "fas fa-file-import",
      type: FoundryMCPImportApp,
      restricted: false
    });
  });

  Hooks.once("ready", () => {
    const api = {
      requestLLM,
      importPayload,
      openImportDialog: () => new FoundryMCPImportApp().render(true)
    };

    game.modules.get(MODULE_ID).api = api;
    window.FoundryMCP = api;
  });
})();
