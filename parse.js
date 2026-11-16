const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~]/;
const BLOCK_TAGS = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
function escapeHtml(s, encode = true) {
  return s.replace(encode ? /[&<>"']/g : /[<>"']/g, (c, offset) => {
    if (c === '&' && encode && /^(?:#(?:\d{1,7}|[xX][\da-fA-F]{1,6})|[A-Za-z][A-Za-z\d]{0,31});/.test(s.slice(offset + 1))) return '&';
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
  });
}
function escapeCode(s) { return s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]); }
function entity(s) {
  return s.replace(/&#(?:x([\da-f]{1,6})|(\d{1,7}));/gi, (m, h, d) => {
    const n = h ? parseInt(h, 16) : Number(d);
    return !n || n > 0x10ffff || n >= 0xd800 && n <= 0xdfff ? '\ufffd' : String.fromCodePoint(n);
  });
}
function normalize(md) { return md.replace(/\r\n|\r/g, '\n').replace(/\0/g, '\ufffd'); }
function stripIndentColumns(s, width) {
  let i = 0, column = 0;
  while (i < s.length && column < width && (s[i] === ' ' || s[i] === '\t')) {
    if (s[i] === ' ') { column++; i++; continue; }
    const next = column + 4 - column % 4;
    i++;
    if (next > width) { column = next; break; }
    column = next;
  }
  if (column < width) return s.slice(i);
  let rest = column > width ? ' '.repeat(column - width) : '';
  column = Math.max(column, width);
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) {
    if (s[i] === ' ') { rest += ' '; column++; }
    else { const next = 4 - column % 4; rest += ' '.repeat(next); column += next; }
    i++;
  }
  return rest + s.slice(i);
}
function expandMarkdownPrefix(s) {
  let out = '', i = 0, column = 0;
  const spaces = () => {
    while (s[i] === ' ' || s[i] === '\t') {
      if (column >= 4 && /^ *$/.test(out)) break;
      if (s[i] === '\t') { const width = 4 - column % 4; out += ' '.repeat(width); column += width; }
      else { out += ' '; column++; }
      i++;
    }
  };
  spaces();
  while (i < s.length) {
    if (s[i] === '>' && column <= 3) { out += '>'; i++; column = 1; spaces(); continue; }
    const marker = s.slice(i).match(/^(?:[*+-]|\d{1,9}[.)]|#{1,6})(?=[ \t]|$)/);
    if (marker) { out += marker[0]; i += marker[0].length; column += marker[0].length; spaces(); continue; }
    break;
  }
  return out + s.slice(i);
}
function normalizeMarkdownTabs(source) {
  let fence = '', rawType = 0, rawEnd;
  return source.split('\n').map(line => {
    if (rawType) {
      if (rawEnd ? rawEnd.test(line) : !line.trim()) rawType = 0;
      return line;
    }
    if (!fence && htmlBlockType(line)) {
      const type = htmlBlockType(line);
      rawEnd = type === 1 ? /-->/ : type === 2 ? /\?>/ : type === 3 ? />/ : type === 4 ? /\]\]>/ : type === 5 ? new RegExp('</' + line.trimStart().match(/^<(script|pre|style|textarea)/i)[1] + '\\s*>', 'i') : null;
      if (!rawEnd || !rawEnd.test(line)) rawType = type;
      return line;
    }
    if (!fence && line === '\t') return line;
    if (fence) {
      if (new RegExp('^ {0,3}' + fence[0] + '{' + fence.length + ',}[ \t]*$').test(line)) fence = '';
      return line;
    }
    const expanded = expandMarkdownPrefix(line);
    const opener = expanded.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (opener && !(opener[1][0] === '`' && opener[2].includes('`'))) fence = opener[1];
    return expanded;
  }).join('\n');
}
function findCodeEnd(source, start, length) {
  for (let i = start + length; i < source.length;) {
    if (source[i] !== '`') { i++; continue; }
    let end = i + 1; while (source[end] === '`') end++;
    if (end - i === length) return i;
    i = end;
  }
  return -1;
}
function labelKey(s) { return s.trim().replace(/[\t\n ]+/g, ' ').replace(/[ßẞ]/g, 'ss').toLowerCase(); }
function cleanUrl(s) { try { return encodeURI(s).replace(/%25/gi, '%'); } catch { return null; } }
function escapeAttribute(s) { return escapeHtml(s).replace(/&amp;((?:#[xX][\da-fA-F]+|#\d+|[A-Za-z][A-Za-z\d]+);)/g, '&$1'); }
function htmlTagEnd(s, start) {
  let quote = '';
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === quote) quote = ''; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return -1;
}
function isHtmlTag(raw) {
  return /^<[A-Za-z][A-Za-z0-9-]*(?:[ \t\n]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t]*=[ \t]*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*[ \t]*\/?>$/.test(raw) || /^<\/[A-Za-z][A-Za-z0-9-]*[ \t]*>$/.test(raw);
}
function htmlBlockType(line) {
  const s = line.replace(/^ {0,3}/, '');
  if (/^<!--/.test(s)) return 1;
  if (/^<\?/.test(s)) return 2;
  if (/^<![A-Z]/.test(s)) return 3;
  if (/^<!\[CDATA\[/.test(s)) return 4;
  if (/^<(?:script|pre|style|textarea)(?=[\s>]|$)/i.test(s)) return 5;
  if (new RegExp(`^</?(?:${BLOCK_TAGS})(?:[\\t\\n ]|/?>|$)`, 'i').test(s)) return 6;
  const end = htmlTagEnd(s, 1);
  return end >= 0 && !s.slice(end + 1).trim() && isHtmlTag(s.slice(0, end + 1)) ? 7 : 0;
}
function delimiterState(s, start, count, marker) {
  const before = start ? s[start - 1] : '', after = s[start + count] || '';
  const white = c => !c || /\s/u.test(c), punct = c => !!c && /[\p{P}\p{S}]/u.test(c);
  const left = !white(after) && (!punct(after) || white(before) || punct(before));
  const right = !white(before) && (!punct(before) || white(after) || punct(after));
  return marker === '_' ? { open: left && (!right || punct(before)), close: right && (!left || punct(after)) } : { open: left, close: right };
}
function markedLeavesLinkLabelLiteral(label) { return /_[^_\n]*``[^`]*`[^`]*``_[^\n]*/.test(label); }
function delimiterPlan(source, refs, inLink) {
  const stack = [], positions = new Map();
  let emphasisMaskedUntil = -1;
  const addRun = (start, length, marker) => {
    const state = delimiterState(source, start, length, marker);
    const run = { start, length, remaining: length, marker, state, opens: [], closes: [], pairedInnerEm: false, skippedSingleEm: false };
    if (state.close) {
      while (run.remaining) {
        let candidate = -1;
        for (let n = stack.length - 1; n >= 0; n--) {
          const opener = stack[n];
          if (!opener.remaining || opener.marker !== marker) continue;
          if (marker === '*' && opener.length >= 2 && opener.pairedInnerEm && run.remaining === 1) { opener.skippedSingleEm = true; continue; }
          const sum = opener.length + run.length;
          const oddRule = (opener.state.close || state.open) && sum % 3 === 0 && (opener.length % 3 !== 0 || run.length % 3 !== 0);
          const innerStrongFlanks = marker === '*' && opener.length === 1 && run.length === 1 && /\s\*\*[^*]+\*\*[\p{L}\p{N}]/u.test(source.slice(opener.start + 1, start + length));
          if (innerStrongFlanks) { stack.splice(n, 1); break; }
          if (!oddRule && !innerStrongFlanks && (marker !== '~' || opener.length === run.length)) { candidate = n; break; }
        }
        if (candidate < 0) break;
        const opener = stack[candidate];
        if (opener.pairedInnerEm) run.pairedInnerEm = true;
        const width = opener.remaining >= 2 && run.remaining >= 2 ? 2 : 1;
        const openTag = marker === '~' ? '<del>' : width === 2 ? '<strong>' : '<em>';
        const closeTag = marker === '~' ? '</del>' : width === 2 ? '</strong>' : '</em>';
        if (marker === '*' && width === 1) {
          for (let n = 0; n < candidate; n++) if (stack[n].marker === '*' && stack[n].length >= 2) stack[n].pairedInnerEm = true;
        }
        opener.opens.unshift(openTag); run.closes.push(closeTag);
        opener.remaining -= width; run.remaining -= width;
        stack.splice(candidate + 1);
        if (!opener.remaining) stack.splice(candidate, 1);
      }
    }
    if (state.open && run.remaining) stack.push(run);
    positions.set(start, run);
  };
  for (let i = 0; i < source.length;) {
    if (source[i] === '\\') { i += 2; continue; }
    if (source[i] === '`') {
      const ticks = source.slice(i).match(/^`+/)[0], end = findCodeEnd(source, i, ticks.length);
      i = end < 0 ? i + ticks.length : end + ticks.length; continue;
    }
    if (source[i] === '<') {
      const end = source.startsWith('<![CDATA[', i) ? source.indexOf(']]>', i + 9) + 2 : htmlTagEnd(source, i + 1);
      if (end >= 0) {
        const raw = source.slice(i, end + 1);
        if (isHtmlTag(raw) || /^<!--|^<\?|^<![A-Z]|^<!\[CDATA\[/.test(raw) || /^<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^\s<>]*>$/.test(raw) || /^<[^\s<>]+@[^\s<>]+>$/.test(raw)) { i = end + 1; continue; }
      }
    }
    if (!inLink && (source[i] === '[' || source[i] === '!' && source[i + 1] === '[')) {
      const opening = i + (source[i] === '!' ? 2 : 1), close = findBracket(source, opening);
      if (close >= 0) {
        if (markedLeavesLinkLabelLiteral(source.slice(opening, close))) { i = close + 1; continue; }
        const after = close + 1;
        if (source[after] === '(') {
          const end = findParen(source, after + 1);
          if (end >= 0 && !hasNestedLink(source, opening, close, refs)) {
            const ticks = [...source.slice(opening, close).matchAll(/`+/g)];
            if (ticks.length === 2 && ticks[0][0].length > ticks[1][0].length) {
              const nextTick = source.indexOf('`', end + 1);
              if (nextTick >= 0 && source[nextTick + ticks[1][0].length] !== '`') emphasisMaskedUntil = nextTick;
            }
            i = end + 1; continue;
          }
        } else {
          const ref = source.slice(after).match(/^\[([^\]]*)\]/);
          const label = labelKey(ref && ref[1] ? ref[1] : source.slice(opening, close));
          if (Object.hasOwn(refs, label) && !hasNestedLink(source, opening, close, refs)) { i = after + (ref ? ref[0].length : 0); continue; }
        }
      }
    }
    if (source[i] !== '*' && source[i] !== '_' && source[i] !== '~') { i++; continue; }
    const marker = source[i];
    let end = i + 1; while (source[end] === marker) end++;
    if (marker === '~' && end - i > 2) { i = end; continue; }
    if (i > emphasisMaskedUntil) addRun(i, end - i, marker);
    i = end;
  }
  return positions;
}
function delimiterHtml(run) {
  const openUsed = run.marker === '~' ? (run.opens.length ? run.length : 0) : run.opens.reduce((n, tag) => n + (tag === '<em>' ? 1 : 2), 0);
  const closeUsed = run.marker === '~' ? (run.closes.length ? run.length : 0) : run.closes.reduce((n, tag) => n + (tag === '</em>' ? 1 : 2), 0);
  if (run.closes.length) {
    const unused = run.marker.repeat(run.length - openUsed - closeUsed);
    if (run.pairedInnerEm && unused && run.closes.includes('</strong>')) return unused + run.closes.join('') + run.opens.join('');
    return run.closes.join('') + run.opens.join('') + unused;
  }
  return run.marker.repeat(run.length - openUsed) + run.opens.join('');
}
function references(src) {
  const refs = Object.create(null), lines = src.split('\n');
  let paragraph = false, fenceMarker = '';
  for (let i = 0; i < lines.length; i++) {
    const quoteLine = lines[i].replace(/^ {0,3}> ?/, '');
    if (fenceMarker) {
      if (new RegExp('^ {0,3}' + fenceMarker[0] + '{' + fenceMarker.length + ',}[ \t]*$').test(lines[i])) fenceMarker = '';
      continue;
    }
    if (/^[ \t]*$/.test(lines[i])) { paragraph = false; continue; }
    const open = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) { fenceMarker = open[1]; paragraph = false; continue; }
    if (/^(?: {4}|\t)/.test(lines[i])) continue;
    if (paragraph || !/^ {0,3}\[/.test(quoteLine)) {
      const block = /^ {0,3}(?:#{1,6}(?:[ \t]|$)|(?:[-*_][ \t]*){3,}$|>|(?:[*+-]|\d{1,9}[.)])(?:[ \t]|$))/.test(lines[i]) || htmlBlockType(lines[i]) > 0;
      paragraph = !block; continue;
    }
    let consumed = i, definitionEnd = i;
    let head = quoteLine.match(/^ {0,3}\[((?:\\.|[^\[\]\\]){1,999})\]:[ \t]*(.*)$/);
    if (!head) {
      let labelText = lines[i].replace(/^ {0,3}\[/, ''), close = -1, escaped = false;
      for (let n = i + 1; n < lines.length && n <= i + 10; n++) {
        if (!lines[n].trim()) break;
        labelText += '\n' + lines[n];
        for (let p = 0; p < lines[n].length; p++) {
          if (escaped) { escaped = false; continue; }
          if (lines[n][p] === '\\') { escaped = true; continue; }
          if (lines[n][p] === ']') { close = labelText.length - lines[n].length + p; break; }
        }
        if (close >= 0 && lines[n].slice(close - (labelText.length - lines[n].length)).startsWith(']:')) {
          head = [null, labelText.slice(0, close), lines[n].slice(close - (labelText.length - lines[n].length) + 2).trimStart()]; consumed = n; break;
        }
      }
    }
    if (!head) { paragraph = true; continue; }
    const key = labelKey(head[1]);
    if (!key) continue;
    let rest = head[2].trimStart();
    if (!rest && consumed + 1 < lines.length && lines[consumed + 1].trim()) { consumed++; rest = lines[consumed].trimStart(); }
    let href = '', after = '';
    if (rest[0] === '<') {
      const end = rest.indexOf('>');
      if (end < 0 || rest[end + 1] && !/[ \t]/.test(rest[end + 1])) continue;
      href = rest.slice(1, end); after = rest.slice(end + 1).trim();
    } else {
      let depth = 0, end = 0;
      for (; end < rest.length; end++) {
        if (rest[end] === '\\') { end++; continue; }
        if (rest[end] === '(') depth++;
        else if (rest[end] === ')' && depth) depth--;
        else if (/\s/.test(rest[end]) && !depth) break;
      }
      href = rest.slice(0, end); after = rest.slice(end).trim();
    }
    if (!href && rest[0] !== '<') continue;
    let title, titleOnNextLine = false;
    if (!after && consumed + 1 < lines.length && /^[ \t]*(?:"|'|\()/.test(lines[consumed + 1])) { consumed++; titleOnNextLine = true; after = lines[consumed].trim(); }
    if (after) {
      const quote = after[0], closing = quote === '(' ? ')' : quote;
      if (quote !== '"' && quote !== "'" && quote !== '(') continue;
      let text = after.slice(1), done = false, escaped = false, depth = quote === '(' ? 1 : 0;
      for (let p = 0; p < text.length; p++) {
        const ch = text[p];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (quote === '(' && ch === '(') depth++;
        if (ch === closing && (quote !== '(' || --depth === 0)) { title = text.slice(0, p); done = !text.slice(p + 1).trim(); break; }
      }
      while (!done && consumed + 1 < lines.length && !/^[ \t]*$/.test(lines[consumed + 1])) {
        text += '\n' + lines[++consumed];
        for (let p = text.length - lines[consumed].length; p < text.length; p++) {
          const ch = text[p];
          if (escaped) { escaped = false; continue; }
          if (ch === '\\') { escaped = true; continue; }
          if (quote === '(' && ch === '(') depth++;
          if (ch === closing && (quote !== '(' || --depth === 0)) { title = text.slice(0, p); done = !text.slice(p + 1).trim(); break; }
        }
      }
      if (!done) { if (titleOnNextLine) { consumed = definitionEnd; after = ''; title = undefined; } else continue; }
      if (title !== undefined) title = title.replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1');
    }
    const decode = s => s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1');
    if (!Object.hasOwn(refs, key)) refs[key] = { href: decode(href), title };
    const quotePrefix = lines[i].match(/^ {0,3}> ?/)?.[0];
    for (let n = i; n <= consumed; n++) lines[n] = n === i && quotePrefix ? quotePrefix.trimEnd() : '';
    i = consumed; paragraph = false;
  }
  return { source: lines.join('\n'), refs };
}
function inline(source, refs, inLink = false) {
  let out = '', i = 0, plain = '';
  const emphasis = delimiterPlan(source, refs, inLink);
  const linked = () => inLink || refs._htmlLinkOpen === true;
  const flush = () => { if (plain) { out += escapeHtml(entity(plain)); plain = ''; } };
  while (i < source.length) {
    const c = source[i];
    if (c === '\u0001') { plain += ' '; i++; continue; }
    if (c === '\\' && i + 1 < source.length) {
      const n = source[i + 1];
      if (PUNCT.test(n)) { flush(); out += escapeHtml(n); i += 2; continue; }
      if (n === '\n') { flush(); out += '<br>'; i += 2; while (source[i] === ' ' || source[i] === '\t') i++; continue; }
    }
    if (c === '\n') {
      let k = plain.length; while (k && plain[k - 1] === ' ') k--;
      if (plain.length - k >= 2) { plain = plain.slice(0, k); flush(); out += '<br>'; i++; while (source[i] === ' ' || source[i] === '\t') i++; }
      else { flush(); out += '\n'; i++; }
      continue;
    }
    if (c === '`') {
      let j = i; while (source[j] === '`') j++;
      const run = source.slice(i, j), end = findCodeEnd(source, i, run.length);
      if (end >= 0) {
        flush(); let text = source.slice(j, end).replace(/\n/g, ' ');
        if (/^ .* $/.test(text) && /[^ ]/.test(text)) text = text.slice(1, -1);
        out += '<code>' + escapeCode(text) + '</code>'; i = end + run.length; continue;
      }
      plain += run; i = j; continue;
    }
    if (c === '<') {
      const end = source.startsWith('<![CDATA[', i) ? source.indexOf(']]>', i + 9) + 2 : htmlTagEnd(source, i + 1);
      if (end >= 0) {
        const raw = source.slice(i, end + 1), body = raw.slice(1, -1);
        if (/^[A-Za-z][A-Za-z0-9.+-]{1,31}:[^\s<>]*$/.test(body)) { flush(); out += '<a href="' + escapeAttribute(cleanUrl(body)) + '">' + escapeHtml(body) + '</a>'; i = end + 1; continue; }
        if (/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(body)) { flush(); out += '<a href="mailto:' + escapeAttribute(cleanUrl(body)) + '">' + escapeHtml(body) + '</a>'; i = end + 1; continue; }
        if (isHtmlTag(raw) || /^<!--|^<\?|^<![A-Z]|^<!\[CDATA\[/.test(raw)) {
          flush(); out += raw;
          if (/^<a[ \t\n]/i.test(raw)) refs._htmlLinkOpen = true;
          else if (/^<\/a[ \t]*>/i.test(raw)) refs._htmlLinkOpen = false;
          i = end + 1; continue;
        }
      }
    }
    if (c === '&') {
      const m = source.slice(i).match(/^&(?:#(?:x[\da-f]{1,6}|\d{1,7})|[A-Za-z][A-Za-z\d]{0,31});/);
      if (m) { flush(); out += entity(m[0]); i += m[0].length; continue; }
    }
    if (c === '[' || c === '!' && source[i + 1] === '[') {
      const image = c === '!', start = i + (image ? 2 : 1), close = findBracket(source, start, true);
      if (close >= 0) {
        const label = source.slice(start, close), after = close + 1;
        let href, title, stop = after, m;
        if (source[after] === '(') {
          const p = findParen(source, after + 1);
          if (p >= 0) { const d = parseDestination(source.slice(after + 1, p)); if (d) { href = d.href; title = d.title; stop = p + 1; } }
        }
        if (href === undefined) {
          m = source.slice(after).match(/^\[([^\]]*)\]/);
          const key = labelKey(m && m[1] ? m[1] : label);
          if (Object.hasOwn(refs, key)) { ({ href, title } = refs[key]); stop = after + (m ? m[0].length : 0); }
        }
        if (href !== undefined && !markedLeavesLinkLabelLiteral(label)) {
          const inside = inline(label, refs, true);
          if (!image && inside.includes('<a href=') && hasNestedLink(label, 0, label.length, refs)) { plain += c; i++; continue; }
          flush(); const target = escapeAttribute(cleanUrl(href)), t = title === undefined ? '' : ' title="' + escapeAttribute(title) + '"';
          const alt = inside.replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/g, '$1').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
          out += image ? '<img src="' + target + '" alt="' + escapeAttribute(alt) + '"' + t + '>' : '<a href="' + target + '"' + t + '>' + inside + '</a>';
          i = stop; continue;
        }
      }
    }
    if (!linked()) {
      const email = source.slice(i).match(/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/);
      const afterEmail = source[i + (email?.[0].length || 0)] || ' ';
      const closesEmphasis = !!email && afterEmail === '_' && emphasis.get(i + email[0].length)?.closes.length;
      if (email && (i === 0 || !/[\w-]/.test(source[i - 1])) && (!/[\w-]/.test(afterEmail) || closesEmphasis)) { flush(); out += '<a href="mailto:' + escapeAttribute(email[0]) + '">' + escapeHtml(email[0]) + '</a>'; i += email[0].length; continue; }
    }
    if (!linked() && /^(?:mailto|xmpp):/i.test(source.slice(i))) {
      const scheme = source.slice(i).match(/^(mailto|xmpp):/i)[1].toLowerCase();
      const email = source.slice(i + scheme.length + 1).match(/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/);
      if (email) {
        let text = source.slice(i, i + scheme.length + 1) + email[0];
        if (scheme === 'xmpp' && source[i + text.length] === '/') { const resource = source.slice(i + text.length).match(/^\/[^/\s]+/); if (resource) text += resource[0]; }
        if (!/[\w-]/.test(source[i + text.length] || '')) { flush(); out += '<a href="' + escapeAttribute(cleanUrl(text)) + '">' + escapeHtml(text) + '</a>'; i += text.length; continue; }
      }
    }
    if (!linked() && /^(?:(?:https?|ftp):\/\/|www\.)/i.test(source.slice(i))) {
      const m = source.slice(i).match(/^(?:(?:https?|ftp):\/\/|www\.)[^\s<>]+/i);
      if (m) {
        let url = m[0], trim = '';
        const openParens = [];
        for (let p = 0; p < url.length; p++) { if (url[p] === '(') openParens.push(p); else if (url[p] === ')') openParens.pop(); }
        if (openParens.length) { const cut = openParens[0]; trim = url.slice(cut); url = url.slice(0, cut); }
        const entitySuffix = url.match(/&[A-Za-z]+;$/);
        if (entitySuffix) { trim = entitySuffix[0] + trim; url = url.slice(0, -entitySuffix[0].length); }
        const unbalanced = closer => {
          const opener = closer === ')' ? '(' : '[';
          let balance = 0, unmatched = false;
          for (const c of url) { if (c === opener) balance++; else if (c === closer) { unmatched = balance === 0; balance = Math.max(0, balance - 1); } }
          return unmatched;
        };
        while (/[.,:;!?*_~]$/.test(url) || /\)$/.test(url) && unbalanced(')')) { trim = url.slice(-1) + trim; url = url.slice(0, -1); }
        if (url && (!/^www\./i.test(url) || url.startsWith('www.'))) {
          flush(); const href = url.startsWith('www.') ? 'http://' + url : url;
          out += '<a href="' + escapeAttribute(cleanUrl(href)) + '">' + escapeHtml(url) + '</a>';
          const tailStart = i + url.length, tailEnd = i + m[0].length;
          let closeAt = -1, closingRun;
          for (let p = tailStart; p < tailEnd; p++) { const candidate = emphasis.get(p); if (candidate?.closes.length) { closeAt = p; closingRun = candidate; break; } }
          if (closingRun) { out += inline(source.slice(tailStart, closeAt), refs); out += delimiterHtml(closingRun); i = closeAt + closingRun.length; }
          else { out += inline(trim, refs); i = tailEnd; }
          continue;
        }
      }
    }
    if (c === '*' || c === '_' || c === '~') {
      let j = i + 1; while (source[j] === c) j++;
      const run = emphasis.get(i);
      if (run && (run.opens.length || run.closes.length)) { flush(); out += delimiterHtml(run); i = j; continue; }
      plain += source.slice(i, j); i = j; continue;
    }
    plain += c; i++;
  }
  flush(); return out;
}
function findBracket(s, from, linkGrammar = false) {
  let depth = 1;
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '`') {
      const m = s.slice(i).match(/^`+/)[0];
      if (!linkGrammar) { const e = s.indexOf(m, i + m.length); if (e >= 0) i = e + m.length - 1; continue; }
      const j = i + m.length;
      if (m.length >= 2 && s[j] === ']') { i = j - 1; continue; }
      const end = s.indexOf('`', j);
      if (end < 0) return -1;
      i = end;
      while (s[i + 1] === '`') i++;
      continue;
    }
    if (s[i] === '<') { const e = htmlTagEnd(s, i + 1); if (e >= 0) { i = e; continue; } }
    if (s[i] === '[') depth++;
    if (s[i] === ']' && --depth === 0) return i;
  }
  return -1;
}
function hasNestedLink(source, start, end, refs) {
  for (let i = start; i < end; i++) {
    if (source[i] !== '[' || source[i - 1] === '!') continue;
    const close = findBracket(source, i + 1);
    if (close < 0 || close >= end) continue;
    const after = close + 1;
    if (source[after] === '(' && findParen(source, after + 1) >= 0) return true;
    const reference = source.slice(after).match(/^\[([^\]]*)\]/);
    const key = labelKey(reference && reference[1] ? reference[1] : source.slice(i + 1, close));
    if (Object.hasOwn(refs, key)) return true;
    i = close;
  }
  return false;
}
function findParen(s, from) {
  let depth = 1, angle = false;
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '<' && !angle) { angle = true; continue; }
    if (s[i] === '>' && angle) { angle = false; continue; }
    if (angle) continue;
    if (s[i] === '(') depth++;
    if (s[i] === ')' && --depth === 0) return i;
  }
  return -1;
}
function parseDestination(s) {
  s = s.replace(/^[ \t\n]+|[ \t\n]+$/g, ''); let dest = '', title;
  if (s[0] === '<') {
    let e = -1;
    for (let i = 1; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '\n') return null; if (s[i] === '>') { e = i; break; } }
    if (e < 0 || s[e + 1] && !/[ \t\n]/.test(s[e + 1])) return null;
    dest = s.slice(1, e); s = s.slice(e + 1).replace(/^[ \t\n]+/, '');
  } else {
    let depth = 0, end = 0;
    for (; end < s.length; end++) {
      if (s[end] === '\\') { end++; continue; }
      if (s[end] === '(') depth++;
      else if (s[end] === ')' && depth) depth--;
      else if (/[ \t\n]/.test(s[end]) && !depth || s[end] === ')' && !depth) break;
    }
    dest = s.slice(0, end); s = s.slice(end).replace(/^[ \t\n]+/, '');
  }
  if (s) {
    const q = s[0], closer = q === '(' ? ')' : q;
    if (q !== '"' && q !== "'" && q !== '(') return null;
    let escaped = false, depth = q === '(' ? 1 : 0, end = -1;
    for (let i = 1; i < s.length; i++) {
      const c = s[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (q === '(' && c === '(') depth++;
      if (c === closer && (q !== '(' || --depth === 0)) { end = i; break; }
    }
    if (end < 0 || s.slice(end + 1).trim()) return null;
    title = s.slice(1, end).replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1');
  }
  return { href: dest.replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1'), title };
}
function parseBlocks(src, refs, tight = false, inListItem = false) {
  const lines = src.split('\n'), out = [];
  let i = 0;
  const blank = s => /^[ \t]*$/.test(s);
  const leadingColumns = s => {
    let column = 0;
    for (const c of s) { if (c === ' ') column++; else if (c === '\t') column += 4 - column % 4; else break; }
    return column;
  };
  const hr = s => /^ {0,3}(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})[ \t]*$/.test(s);
  const fence = s => { const m = s.match(/^( {0,3})(`{3,}|~{3,})(.*)$/); return m && m[2][0] === '`' && m[3].includes('`') ? null : m; };
  const heading = s => s.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/);
  const list = s => s.match(/^ {0,3}([*+-]|\d{1,9}[.)])([ \t]+|$)(.*)$/);
  const tableStart = index => index + 1 < lines.length && lines[index].includes('|') && /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[index + 1]) && /-/.test(lines[index + 1]);
  const blockType = s => htmlBlockType(s), htmlStart = s => blockType(s) > 0, htmlInterrupt = s => blockType(s) > 0 && blockType(s) <= 6;
  const interrupt = (s, index = -1) => {
    if (blank(s)) return false;
    const item = list(s);
    const listInterrupt = item && item[3].trim() !== '' && (!/^\d/.test(item[1]) || inListItem || Number(item[1].slice(0, -1)) === 1);
    return hr(s) || heading(s) || fence(s) || /^ {0,3}>/.test(s) || listInterrupt || htmlInterrupt(s) || index >= 0 && tableStart(index);
  };
  while (i < lines.length) {
    let line = lines[i];
    if (blank(line)) { i++; continue; }
    if (/^ {0,3}\[/.test(line)) {
      let end = i + 1; while (end < lines.length && !blank(lines[end])) end++;
      const definitions = references(lines.slice(i, end).join('\n'));
      if (Object.keys(definitions.refs).length && definitions.source.split('\n')[0] !== line) {
        for (const key of Object.keys(definitions.refs)) if (!Object.hasOwn(refs, key)) refs[key] = definitions.refs[key];
        const remaining = definitions.source.split('\n');
        for (let n = i; n < end; n++) lines[n] = remaining[n - i];
        continue;
      }
    }
    const h = heading(line);
    if (h) {
      let text = h[2] || '';
      text = /^#+[ \t]*$/.test(text.trim()) ? '' : text.replace(/[ \t]+#+[ \t]*$/, '').trim();
      out.push('<h' + h[1].length + '>' + inline(text, refs) + '</h' + h[1].length + '>\n'); i++; continue;
    }
    if (hr(line)) { out.push('<hr>\n'); i++; continue; }
    const f = fence(line);
    if (f) {
      const indent = f[1].length, marker = f[2], lang = (f[3].trim().match(/^\S+/) || [''])[0].replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1'), body = [];
      i++; while (i < lines.length && !new RegExp('^ {0,3}' + marker[0] + '{' + marker.length + ',}[ \t]*$').test(lines[i])) body.push(lines[i++]);
      const closed = i < lines.length; if (closed) i++;
      if (marker[0] === '`') for (let n = 0; n < body.length; n++) body[n] = body[n].replace(new RegExp('^[ \t]{0,' + indent + '}'), '');
      if (body[body.length - 1] === '') body.pop();
      if (!closed && /\n\n$/.test(src) && body[body.length - 1] === '') body.pop();
      const code = body.join('\n') + (body.length ? '\n' : '');
      out.push('<pre><code' + (lang ? ' class="language-' + escapeAttribute(lang) + '"' : '') + '>' + escapeCode(code) + '</code></pre>\n'); continue;
    }
    if (/^(?: {4}|\t)/.test(line)) {
      const code = [];
      while (i < lines.length) {
        if (/^(?: {4}|\t)/.test(lines[i])) { code.push(lines[i].replace(/^(?: {4}|\t)/, '')); i++; }
        else if (blank(lines[i])) { code.push(''); i++; } else break;
      }
      while (code.length && !code[code.length - 1]) code.pop();
      if (code.length) out.push('<pre><code>' + escapeCode(code.join('\n') + '\n') + '</code></pre>\n'); continue;
    }
    if (/^ {0,3}>/.test(line)) {
      const q = [];
      let canLazy = false, hasLazyText = false, quoteFence = '';
      while (i < lines.length) {
        if (/^ {0,3}>/.test(lines[i])) {
          const text = expandMarkdownPrefix(lines[i++]).replace(/^ {0,3}> ?/, ''), quotedFence = fence(text);
          q.push(/^ +$/.test(text) && q.some(value => value.trim() && value !== '\u0001') ? '\u0001' : text);
          if (quoteFence) {
            const close = text.match(/^ {0,3}(`+|~+)[ \t]*$/);
            if (close && close[1][0] === quoteFence[0] && close[1].length >= quoteFence.length) quoteFence = '';
            canLazy = false;
          } else if (quotedFence) { quoteFence = quotedFence[2]; canLazy = false; }
          else canLazy = !!text.trim() && !/^(?: {4}|~{3,})/.test(text) && !hr(text) && !heading(text) && !htmlStart(text);
        } else if (canLazy && !blank(lines[i])) {
          const setextLine = /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[i]);
          if (interrupt(lines[i], i) && !(setextLine && hasLazyText) || hr(lines[i])) break;
          if (setextLine) { if (!hasLazyText) break; q.push('    ' + lines[i].trimStart()); }
          else {
            let text = /^(?: {4}|\t)/.test(lines[i]) ? lines[i].replace(/^(?: {4}|\t)/, '') : lines[i];
            if (list(text) || heading(text)) text = '\\' + text.trimStart();
            q.push(text);
          }
          hasLazyText = true; i++;
        } else break;
      }
      out.push('<blockquote>\n' + parseBlocks(q.join('\n'), refs) + '</blockquote>\n'); continue;
    }
    const li = list(line);
    if (li) {
      const listBlank = s => blank(s) || s === '\u0001';
      const ordered = /^\d/.test(li[1]), delim = ordered ? li[1].slice(-1) : li[1], items = [];
      let loose = false, start = ordered ? Number(li[1].slice(0, -1)) : 1;
      while (i < lines.length) {
        const m = lines[i].match(/^ {0,3}([*+-]|\d{1,9}[.)])([ \t]+|$)(.*)$/);
        if (!m || /^\d/.test(m[1]) !== ordered || (ordered ? m[1].slice(-1) !== delim : m[1] !== delim) || hr(lines[i])) break;
        const itemIndent = lines[i].match(/^ */)[0].length, pad = m[2].length, extra = pad >= 5 ? pad - 1 : 0;
        const contentIndent = itemIndent + m[1].length + (!m[3].trim() ? 1 : pad >= 5 ? 1 : Math.max(1, pad));
        const content = [extra ? ' '.repeat(extra) + m[3] : m[3]];
        i++;
        let openFence = '';
        const firstFence = m[3].match(/^ {0,3}(`{3,}|~{3,})/); if (firstFence) openFence = firstFence[1];
        while (i < lines.length) {
          if (listBlank(lines[i])) {
            let next = i; while (next < lines.length && listBlank(lines[next])) next++;
            if (next >= lines.length) { i = next; break; }
            if (openFence) { for (let n = i; n < next; n++) content.push(''); i = next; continue; }
            const nextIndent = leadingColumns(lines[next]), nextItem = list(lines[next]);
            const sameList = nextItem && /^\d/.test(nextItem[1]) === ordered && (ordered ? nextItem[1].slice(-1) === delim : nextItem[1] === delim);
            if (nextItem && nextIndent < contentIndent) { if (sameList) loose = true; i = next; break; }
            if (!content[0].trim()) { i = next; break; }
            if (nextIndent >= contentIndent) {
              const prior = content.slice().reverse().find(value => value.trim());
              const nestedMarker = prior && /^ {1,}[*+-]|^ {1,}\d{1,9}[.)]/.test(prior);
              const nestedListStart = nextIndent >= contentIndent && (nextItem || list(stripIndentColumns(lines[next], contentIndent)));
              const nestedListAlreadyStarted = content.some(value => /^ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|$)/.test(value));
              const nestedContentContinues = nestedListAlreadyStarted && (nextIndent > contentIndent || nestedListStart);
              if (!nestedContentContinues && (nextIndent === contentIndent || nextIndent >= contentIndent + 4 && !nestedMarker)) loose = true;
              for (let n = i; n < next; n++) content.push('');
              i = next; continue;
            }
            i = next; break;
          }
          const indent = leadingColumns(lines[i]);
          if (openFence) {
            if (indent < contentIndent && content[content.length - 1].trimStart().startsWith(openFence)) break;
            const possibleClose = lines[i].match(/^ {0,3}(`+|~+)[ \t]*$/);
            if (possibleClose && indent < contentIndent) break;
            const fenceLine = indent >= contentIndent ? stripIndentColumns(lines[i], contentIndent) : lines[i];
            content.push(fenceLine);
            const close = fenceLine.match(/^ {0,3}(`+|~+)[ \t]*$/);
            if (close && close[1][0] === openFence[0] && close[1].length >= openFence.length) openFence = '';
            i++; continue;
          }
          const nextItem = list(lines[i]);
          if (nextItem && indent < contentIndent) break;
          if (indent >= contentIndent) content.push(stripIndentColumns(lines[i], contentIndent));
          else if (!interrupt(lines[i], i)) {
            let continuation = lines[i], leading = continuation.match(/^ */)[0];
            if (/^(?:[*+-]|\d{1,9}[.)])(?:[ \t]|$)/.test(continuation.slice(leading.length))) continuation = leading + '\\' + continuation.slice(leading.length);
            content.push(continuation);
          } else break;
          const nextFence = content[content.length - 1].match(/^ {0,3}(`{3,}|~{3,})/);
          if (nextFence && !(nextFence[1][0] === '`' && content[content.length - 1].slice(nextFence[0].length).includes('`'))) openFence = nextFence[1];
          i++;
        }
        const itemSource = content.join('\n'); items.push({ lines: content, task: itemSource.match(/^\[([ xX])\][ \t]+/) });
        if (i < lines.length && listBlank(lines[i])) break;
      }
      const tag = ordered ? 'ol' : 'ul', attrs = ordered && start !== 1 ? ' start="' + start + '"' : '';
      let html = '<' + tag + attrs + '>\n';
      for (const record of items) {
        const item = record.lines.join('\n').replace(/[ \t]+$/, ''), task = record.task;
        const activeTask = task && /\n {0,3}(?:=+|-+)[ \t]*$/.test(item) ? null : task;
        const text = activeTask ? item.replace(/^\[[ xX]\][ \t]+/, '') : item;
        let body = parseBlocks(text, refs, !loose, true);
        if (activeTask) { const checkbox = '<input ' + (activeTask[1] !== ' ' ? 'checked="" ' : '') + 'disabled="" type="checkbox"> '; body = body.startsWith('<p>') ? '<p>' + checkbox + body.slice(3) : checkbox + body; }
        html += '<li>' + body + '</li>\n';
      }
      out.push(html + '</' + tag + '>\n'); continue;
    }
    if (htmlStart(line)) {
      const type = blockType(line), raw = [];
      const terminator = type === 1 ? /-->/ : type === 2 ? /\?>/ : type === 3 ? />/ : type === 4 ? /\]\]>/ : type === 5 ? new RegExp('</' + line.trimStart().match(/^<(script|pre|style|textarea)/i)[1] + '\\s*>', 'i') : null;
      while (i < lines.length) {
        const current = lines[i]; raw.push(current); i++;
        if (terminator && terminator.test(current) || !terminator && (i >= lines.length || blank(lines[i]))) break;
      }
      const hasSeparatorBlank = i < lines.length && blank(lines[i]) && !(i === lines.length - 1 && src.endsWith('\n'));
      const blankEof = terminator && !raw.some(value => terminator.test(value)) && /\n\n$/.test(src);
      let html = raw.join('\n');
      if (blankEof) html = html.replace(/\n+$/, '');
      if (hasSeparatorBlank) { html = html.replace(/\n$/, ''); if (terminator && lines[i].length && raw.some(value => terminator.test(value))) html += '\n'; }
      else if (!blankEof && (i < lines.length || src.endsWith('\n') && (!terminator || raw.some(value => terminator.test(value))))) html += '\n';
      out.push(html); continue;
    }
    if (i + 1 < lines.length && line.includes('|') && /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      const heads = splitCells(line), aligns = splitCells(lines[i + 1]);
      if (heads.length === aligns.length) {
        const align = aligns.map(x => x.trim().startsWith(':') ? x.trim().endsWith(':') ? 'center' : 'left' : x.trim().endsWith(':') ? 'right' : '');
        i += 2; const rows = [];
        while (i < lines.length && (lines[i].trim() || lines[i].includes('\t')) && (lines[i].includes('|') || !interrupt(lines[i], i))) rows.push(splitCells(lines[i++]));
        const cell = (v, n, head) => '<' + (head ? 'th' : 'td') + (align[n] ? ' align="' + align[n] + '"' : '') + '>' + inline((v || '').trim(), refs) + '</' + (head ? 'th' : 'td') + '>\n';
        out.push('<table>\n<thead>\n<tr>\n' + heads.map((v,n)=>cell(v,n,true)).join('') + '</tr>\n</thead>\n' + (rows.length ? '<tbody>' + rows.map(r=>'<tr>\n'+heads.map((_,n)=>cell(r[n],n,false)).join('')+'</tr>\n').join('')+'</tbody>' : '') + '</table>\n'); continue;
      }
    }
    const setext = s => /^ {0,3}(?:=+|-+)[ \t]*$/.test(s), para = [line]; i++;
    while (i < lines.length && !blank(lines[i]) && !interrupt(lines[i], i) && !setext(lines[i])) para.push(lines[i++]);
    if (i < lines.length && setext(lines[i])) { const depth = lines[i].includes('=') ? 1 : 2; out.push('<h' + depth + '>' + inline(para.join('\n').trim(), refs) + '</h' + depth + '>\n'); i++; }
    else {
      let text = para.join('\n');
      if (tight && inListItem) text = text.replace(/[ \t]+(?=\n|$)/g, '');
      if (tight && inListItem && para.length > 1) {
        const normalized = [];
        for (let n = 0; n < para.length; n++) {
          const indentedText = n > 0 && leadingColumns(para[n]) >= 4;
          normalized.push(indentedText ? stripIndentColumns(para[n], 4) : para[n]);
          if (indentedText && n + 1 < para.length && leadingColumns(para[n + 1]) < 4) normalized.push('');
        }
        text = normalized.join('\n');
      }
      out.push(tight ? inline(text, refs) : '<p>' + inline(text, refs) + '</p>\n');
    }
  }
  return out.join('');
}
function splitCells(line) {
  line = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out = []; let cell = '', escaped = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && !escaped) { escaped = true; cell += c; continue; }
    if (c === '|' && !escaped) { out.push(cell); cell = ''; } else cell += c;
    escaped = false;
  }
  out.push(cell); return out.map(value => value.replace(/\\\|/g, '|'));
}
export function parse(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('markdown must be a string');
  const normalized = normalizeMarkdownTabs(normalize(markdown)), refs = Object.create(null);
  parseBlocks(normalized, refs);
  refs._htmlLinkOpen = false;
  return parseBlocks(normalized, refs);
}
