// === Request-body builder ===
// Builds a best-effort JSON request body for a method from its input-message
// schema (messages.json) + harvested live IDs. Connect+JSON uses camelCase
// jsonNames, so proto snake_case field names are camelCased here.

function snakeToCamel(name) {
    return name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// Map a camelCased field name → a harvested value (or a sensible scalar default).
function pickForField(camel, ids) {
    const n = camel.toLowerCase();
    if (/^(conversationid|cascadeid)$/.test(n)) return ids.conversationIds[0] || ids.trajectoryIds[0];
    if (/trajectoryid/.test(n)) return ids.trajectoryIds[0] || ids.conversationIds[0];
    if (/(^stepindex$|fromstepindex|startindex|^index$)/.test(n)) return 0;
    if (/(endindex|tostepindex|endindexexclusive)/.test(n)) return 50;
    if (/(workspaceuri|folderuri|absoluteuri|^uri$|^path$)/.test(n)) return ids.workspaceUris[0];
    if (/modelid/.test(n)) return ids.modelIds[0];
    return undefined;
}

/**
 * @param {string} method
 * @param {Record<string,{input:string}>} byMethod  method → registry entry
 * @param {Record<string,{fields:{no,name,label,type}[]}>} messages
 * @param {object} ids harvested ids
 * @returns {{body:object, filled:string[], missing:string[]}}
 */
function buildBody(method, byMethod, messages, ids) {
    const meta = byMethod[method];
    const out = { body: {}, filled: [], missing: [] };
    if (!meta) return out;
    const msg = messages[meta.input];
    if (!msg || !Array.isArray(msg.fields) || !msg.fields.length) return out; // no-arg

    for (const f of msg.fields) {
        const camel = snakeToCamel(f.name);
        const val = pickForField(camel, ids);
        if (val !== undefined) { out.body[camel] = val; out.filled.push(camel); }
        else if (f.label !== 'repeated') { out.missing.push(camel); }
    }
    return out;
}

module.exports = { buildBody, snakeToCamel, pickForField };
