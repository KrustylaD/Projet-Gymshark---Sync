/* ============================================================
   RENDU MARKDOWN & FORMATTING (pures)
   ============================================================ */

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => {
        const entities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };
        return entities[char] || char;
    });
}

function normalizeAssistantLine(line) {
    let value = String(line || '').replace(/\t/g, '    ').trimEnd();

    value = value
        .replace(/^\s*[•●▪◦·]\s*/u, '- ')
        .replace(/^\s*[–—]\s+/u, '- ')
        .replace(/^\s*[✓✔☑]\s*/u, '- ')
        .replace(/^\s*(\d+)[\)]\s+/u, '$1. ');

    if (/^\s*\.(?=\S)/u.test(value)) {
        value = value.replace(/^\s*\.\s*/u, '- ');
    }

    return value;
}

function normalizeAssistantContent(content) {
    return String(content || '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => normalizeAssistantLine(line))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function autoFormatInlineText(text) {
    let value = String(text || '').trim();

    if (!/^\*\*/.test(value)) {
        value = value.replace(
            /^([A-ZÀ-Ÿ0-9][^:\n]{1,34})\s:\s+(.+)$/u,
            '**$1** : $2'
        );
    }

    return value;
}

function renderInlineMarkdown(text) {
    let html = escapeHtml(autoFormatInlineText(text));
    const codeTokens = [];

    html = html.replace(/`([^`\n]+)`/g, (_, code) => {
        const token = `%%CODE_TOKEN_${codeTokens.length}%%`;
        codeTokens.push(`<code>${code}</code>`);
        return token;
    });

    html = html
        .replace(/\*\*([^\n*][\s\S]*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^\n_][\s\S]*?)__/g, '<strong>$1</strong>')
        .replace(/\*(?!\s)([^*\n]+?)\*/g, '<em>$1</em>')
        .replace(/_(?!\s)([^_\n]+?)_/g, '<em>$1</em>');

    for (const [index, snippet] of codeTokens.entries()) {
        html = html.replace(`%%CODE_TOKEN_${index}%%`, snippet);
    }

    return html;
}

function getListItemDescriptor(line) {
    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/u);
    if (unorderedMatch) {
        return { type: 'ul', content: unorderedMatch[1].trim() };
    }

    const orderedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/u);
    if (orderedMatch) {
        return { type: 'ol', number: Number(orderedMatch[1]), content: orderedMatch[2].trim() };
    }

    return null;
}

function getMarkdownHeading(line) {
    const match = line.match(/^(#{1,4})\s+(.*)$/u);
    if (!match) return null;

    return {
        level: Math.min(Math.max(match[1].length, 1), 4),
        text: match[2].trim(),
    };
}

function isLikelySectionTitle(line, nextLine = '') {
    const value = line.trim();
    if (!value || value.length > 72) return false;
    if (/[.!?]$/.test(value) && !/:$/.test(value)) return false;
    if (/^[-*+>#`]/.test(value)) return false;
    if (/^\d+\.\s+/.test(value)) return false;

    const next = String(nextLine || '').trim();
    return /:$/.test(value)
        || Boolean(getListItemDescriptor(next))
        || /^#{1,4}\s+/.test(value);
}

function isStandaloneQuestion(line) {
    const value = line.trim();
    return value.endsWith('?') && value.length <= 120;
}

function renderAssistantNodes(nodes) {
    return nodes.map((node) => {
        if (node.type === 'heading') {
            return `<h${node.level}>${renderInlineMarkdown(node.text)}</h${node.level}>`;
        }

        if (node.type === 'hr') {
            return '<hr>';
        }

        if (node.type === 'list') {
            const tag = node.ordered ? 'ol' : 'ul';
            const startAttr = node.ordered && node.start > 1 ? ` start="${node.start}"` : '';
            const items = node.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('');
            return `<${tag}${startAttr}>${items}</${tag}>`;
        }

        if (node.type === 'paragraph') {
            const className = node.isQuestion ? ' class="assistant-question"' : '';
            const content = node.lines.map((line) => renderInlineMarkdown(line)).join('<br>');
            return `<p${className}>${content}</p>`;
        }

        return '';
    }).join('');
}

export function renderAssistantMessage(content) {
    const normalized = normalizeAssistantContent(content);
    if (!normalized) return '<p></p>';

    const lines = normalized.split('\n');
    const nodes = [];
    let paragraphLines = [];
    let listState = null;

    const flushParagraph = () => {
        if (!paragraphLines.length) return;
        const snapshot = [...paragraphLines];
        nodes.push({
            type: 'paragraph',
            lines: snapshot,
            isQuestion: snapshot.length === 1 && isStandaloneQuestion(snapshot[0]),
        });
        paragraphLines = [];
    };

    const flushList = () => {
        if (!listState) return;
        nodes.push({
            type: 'list',
            ordered: listState.type === 'ol',
            start: listState.start,
            items: [...listState.items],
        });
        listState = null;
    };

    for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index];
        const line = rawLine.trim();
        const nextLine = index + 1 < lines.length ? lines[index + 1] : '';

        if (!line) {
            flushParagraph();
            flushList();
            continue;
        }

        if (/^---+$/u.test(line)) {
            flushParagraph();
            flushList();
            nodes.push({ type: 'hr' });
            continue;
        }

        const markdownHeading = getMarkdownHeading(line);
        if (markdownHeading) {
            flushParagraph();
            flushList();
            nodes.push({ type: 'heading', ...markdownHeading });
            continue;
        }

        if (isLikelySectionTitle(line, nextLine) && !getListItemDescriptor(line)) {
            flushParagraph();
            flushList();
            nodes.push({
                type: 'heading',
                level: /:$/.test(line) ? 3 : 2,
                text: line.replace(/:\s*$/u, '').trim(),
            });
            continue;
        }

        const listItem = getListItemDescriptor(line);
        if (listItem) {
            flushParagraph();

            if (!listState || listState.type !== listItem.type) {
                flushList();
                listState = {
                    type: listItem.type,
                    start: listItem.type === 'ol' ? listItem.number : 1,
                    items: [],
                };
            }

            listState.items.push(listItem.content);
            continue;
        }

        flushList();
        paragraphLines.push(line);
    }

    flushParagraph();
    flushList();

    return renderAssistantNodes(nodes);
}

function tryExtractAssistantTransportError(content) {
    const rawContent = String(content || '').trim();
    if (!rawContent) return '';

    const isWrappedTransportError = /^Erreur\s*:\s*/i.test(rawContent)
        && /ollama http error|internal server error|runner process has terminated|timeout|llm error|failed to fetch|networkerror|network request/i.test(rawContent);
    const isPlainTransportError = /^(Ollama HTTP error|Failed to fetch|NetworkError|TypeError: Failed to fetch|Ollama request aborted)/i.test(rawContent);

    if (isWrappedTransportError || isPlainTransportError) {
        return rawContent.replace(/^Erreur\s*:\s*/i, '').trim();
    }

    if (!rawContent.startsWith('{') || !rawContent.includes('"message"')) return '';

    try {
        const parsed = JSON.parse(rawContent);
        const message = typeof parsed?.message === 'string' ? parsed.message.trim() : '';
        if (!message) return '';

        if (/ollama|internal server error|runner process has terminated|timeout|llm error/i.test(message)) {
            return message;
        }
    } catch {
        return '';
    }

    return '';
}

function formatAssistantErrorMessage(message) {
    const detail = String(message || '').trim();

    if (!detail) {
        return 'Le serveur de reponse a rencontre une erreur.';
    }

    if (/runner process has terminated|internal server error/i.test(detail)) {
        return 'Le moteur local Ollama a rencontre une erreur interne. Verifiez Ollama puis reessayez.';
    }

    if (/timeout|aborted/i.test(detail)) {
        return 'Le moteur local Ollama a mis trop de temps a repondre. Reessayez dans un instant.';
    }

    if (/failed to fetch|networkerror|network request|connexion|connection/i.test(detail)) {
        return 'Connexion impossible avec le backend local. Verifiez que le serveur est lance.';
    }

    if (/ollama http error/i.test(detail)) {
        return 'Le moteur local Ollama a retourne une erreur. Verifiez Ollama puis reessayez.';
    }

    return `Le serveur de reponse a rencontre une erreur : ${detail}`;
}

export function getAssistantDisplayContent(content) {
    const transportError = tryExtractAssistantTransportError(content);
    if (transportError) {
        return formatAssistantErrorMessage(transportError);
    }

    return String(content || '');
}

