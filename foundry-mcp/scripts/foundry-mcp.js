(() => {
  const MODULE_ID = "foundry-mcp";

  function getSetting(key) {
    return game.settings.get(MODULE_ID, key);
  }

  function getRunnerUrl() {
    const value = getSetting("proxyUrl").trim();
    return value.replace(/\/$/, "");
  }

  function getRunnerToken() {
    return getSetting("proxyToken").trim();
  }

  async function requestRunner(payload) {
    const runnerUrl = getRunnerUrl();
    const runnerToken = getRunnerToken();

    if (!runnerUrl) {
      throw new Error("Foundry MCP: runner URL is not configured.");
    }
    if (!runnerToken) {
      throw new Error("Foundry MCP: runner token is not configured.");
    }

    const response = await fetch(`${runnerUrl}/v1/cli/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Foundry-Runner-Token": runnerToken
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Foundry MCP: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  async function requestPayload(payload) {
    const runnerUrl = getRunnerUrl();
    const runnerToken = getRunnerToken();

    if (!runnerUrl) {
      throw new Error("Foundry MCP: runner URL is not configured.");
    }
    if (!runnerToken) {
      throw new Error("Foundry MCP: runner token is not configured.");
    }

    const response = await fetch(`${runnerUrl}/v1/payload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Foundry-Runner-Token": runnerToken
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Foundry MCP: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  async function requestLLM(payload) {
    return requestRunner(payload);
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

  class FoundryMCPPromptApp extends FormApplication {
    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        id: "foundry-mcp-prompt",
        title: "Foundry MCP Prompt",
        template: "modules/foundry-mcp/templates/prompt-panel.html",
        width: 560,
        height: "auto"
      });
    }

    getData() {
      const payloadText = this._payload
        ? JSON.stringify(this._payload, null, 2)
        : "";
      return {
        providers: ["codex", "claude", "obsidian"],
        prompt: this._prompt || "",
        model: this._model || "",
        paths: this._paths || "",
        filterType: this._filterType || "",
        response: this._response || "",
        payload: payloadText,
        hasPayload: Boolean(this._payload)
      };
    }

    activateListeners(html) {
      super.activateListeners(html);
      html.find("[data-action='run']").on("click", (event) =>
        this._onRun(event, html)
      );
      html.find("[data-action='import']").on("click", (event) =>
        this._onImport(event)
      );
    }

    async _onRun(event, html) {
      event.preventDefault();
      const provider = html.find("[name='provider']").val();
      const prompt = (html.find("[name='prompt']").val() || "").trim();
      const model = (html.find("[name='model']").val() || "").trim();
      const pathsRaw = (html.find("[name='paths']").val() || "").trim();
      const filterType = (html.find("[name='filterType']").val() || "").trim();

      if (provider !== "obsidian" && !prompt) {
        ui.notifications.warn("Foundry MCP: enter a prompt first.");
        return;
      }

      this._prompt = prompt;
      this._model = model;
      this._paths = pathsRaw;
      this._filterType = filterType;

      try {
        let result;

        if (provider === "obsidian") {
          const paths = pathsRaw
            ? pathsRaw.split(",").map((value) => value.trim()).filter(Boolean)
            : undefined;
          result = await requestPayload({
            paths,
            type: filterType || undefined
          });
        } else {
          result = await requestRunner({
            provider,
            prompt,
            model: model || undefined,
            options: { responseFormat: "json" }
          });
        }

        this._response = result.content || "";
        this._payload = result.payload || null;

        if (provider === "obsidian") {
          this._payload = result.documents ? result : result.payload || result;
        }

        if (!this._payload && this._response) {
          try {
            const parsed = JSON.parse(this._response);
            if (parsed && typeof parsed === "object") {
              this._payload = parsed.payload || parsed;
            }
          } catch {
            // leave payload empty
          }
        }

        const payloadText = this._payload
          ? JSON.stringify(this._payload, null, 2)
          : "";
        html.find("[name='response']").val(this._response);
        html.find("[name='payload']").val(payloadText);
        html.find("[data-action='import']").prop("disabled", !this._payload);
      } catch (error) {
        ui.notifications.error(error.message);
      }
    }

    async _onImport(event) {
      event.preventDefault();
      if (!this._payload) {
        ui.notifications.warn("Foundry MCP: no payload to import.");
        return;
      }
      await importPayload(this._payload);
    }
  }

  Hooks.once("init", () => {
    game.settings.register(MODULE_ID, "proxyUrl", {
      name: "Runner URL",
      hint: "Base URL of the MCP runner service (e.g. https://your-app.up.railway.app).",
      scope: "client",
      config: true,
      type: String,
      default: ""
    });

    game.settings.register(MODULE_ID, "proxyToken", {
      name: "Runner Token",
      hint: "Shared secret sent in X-Foundry-Runner-Token.",
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

    game.settings.registerMenu(MODULE_ID, "promptMenu", {
      name: "Prompt Panel",
      label: "Open Prompt Panel",
      hint: "Send prompts to the runner and import the returned JSON payload.",
      icon: "fas fa-terminal",
      type: FoundryMCPPromptApp,
      restricted: false
    });
  });

  Hooks.once("ready", () => {
    const api = {
      requestLLM,
      requestRunner,
      requestPayload,
      importPayload,
      openImportDialog: () => new FoundryMCPImportApp().render(true),
      openPromptPanel: () => new FoundryMCPPromptApp().render(true)
    };

    game.modules.get(MODULE_ID).api = api;
    window.FoundryMCP = api;
  });
})();
