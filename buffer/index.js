import Area from './area.js'
import Point from './point.js'
import Event from './event.js'
import Regexp from './regexp.js'

import SkipString from './skipstring.js'
import PrefixTree from './prefixtree.js'
import Segments from './segments.js'
import Indexer from './indexer.js'
import Tokens from './tokens.js'
import Syntax from './syntax.js'

var EOL = /\r\n|\r|\n/g;
var NEWLINE = /\n/g;
var WORDS = Regexp.create(['tokens'], 'g');

var SEGMENT = {
  'comment': '/*',
  'string': '`',
};

export default function Buffer() {
  this.log = [];
  this.syntax = new Syntax;
  this.indexer = new Indexer(this);
  this.segments = new Segments(this);
  this.setText('');
}

Buffer.prototype.__proto__ = Event.prototype;

Buffer.prototype.updateRaw = function() {
  this.raw = this.text.toString();
};

Buffer.prototype.copy = function() {
  this.updateRaw();
  var buffer = new Buffer;
  buffer.replace(this);
  return buffer;
};

Buffer.prototype.replace = function(data) {
  this.raw = data.raw;
  this.text.set(this.raw);
  this.tokens = data.tokens.copy();
  this.segments.clearCache();
};

Buffer.prototype.setText = function(text) {
  text = normalizeEOL(text);

  this.raw = text //this.syntax.highlight(text);

  this.syntax.tab = ~this.raw.indexOf('\t') ? '\t' : ' ';

  this.text = new SkipString;
  this.text.set(this.raw);

  this.tokens = new Tokens;
  this.tokens.index(this.raw);
  this.tokens.on('change segments', this.emit.bind(this, 'change segments'));

  this.prefix = new PrefixTree;
  this.prefix.index(this.raw);

  this.emit('set');
};

Buffer.prototype.insert =
Buffer.prototype.insertTextAtPoint = function(p, text, noLog) {
  if (!noLog) this.emit('before update');

  text = normalizeEOL(text);

  var length = text.length;
  var point = this.getPoint(p);
  var shift = (text.match(NEWLINE) || []).length;
  var range = [point.y, point.y + shift];
  var offsetRange = this.getLineRangeOffsets(range);

  var before = this.getOffsetRangeText(offsetRange);
  this.text.insert(point.offset, text);
  offsetRange[1] += text.length;
  var after = this.getOffsetRangeText(offsetRange);
  this.prefix.index(after);
  this.tokens.update(offsetRange, after, length);
  this.segments.clearCache(offsetRange[0]);
  if (!noLog) this.appendLog('insert', [point.offset, point.offset + text.length], text)

  if (!noLog) this.emit('update', range, shift, before, after);

  return text.length;
};

Buffer.prototype.remove =
Buffer.prototype.removeOffsetRange = function(o, noLog) {
  if (!noLog) this.emit('before update');

  var a = this.getOffsetPoint(o[0]);
  var b = this.getOffsetPoint(o[1]);
  var length = o[0] - o[1];
  var range = [a.y, b.y];
  var shift = a.y - b.y;

  var offsetRange = this.getLineRangeOffsets(range);
  var before = this.getOffsetRangeText(offsetRange);
  var text = this.text.getRange(o);
  this.text.remove(o);
  offsetRange[1] += length;
  var after = this.getOffsetRangeText(offsetRange);
  this.prefix.index(after);
  this.tokens.update(offsetRange, after, length);
  this.segments.clearCache(offsetRange[0]);
  if (!noLog) this.appendLog('remove', o, text)

  if (!noLog) this.emit('update', range, shift, before, after);
};

Buffer.prototype.appendLog = function(type, offsets, text) {
  if (type === 'insert') {
    var lastLog = this.log[this.log.length - 1];
    if (lastLog && lastLog[0] === 'insert' && lastLog[1][1] === offsets[0]) {
      lastLog[1][1] += text.length;
      lastLog[2] += text;
    } else {
      this.log.push(['insert', offsets, text]);
    }
  } else if (type === 'remove') {
    var lastLog = this.log[this.log.length - 1];
    if (lastLog && lastLog[0] === 'remove' && lastLog[1][0] === offsets[1]) {
      lastLog[1][0] -= text.length;
      lastLog[2] = text + lastLog[2];
    } else {
      this.log.push(['remove', offsets, text]);
    }
  }
}

Buffer.prototype.removeArea = function(area) {
  var offsets = this.getAreaOffsetRange(area);
  return this.removeOffsetRange(offsets);
};

Buffer.prototype.removeCharAtPoint = function(p) {
  var point = this.getPoint(p);
  var offsetRange = [point.offset, point.offset+1];
  return this.removeOffsetRange(offsetRange);
};

Buffer.prototype.get = function(range) {
  var code = this.getLineRangeText(range);

  // calculate indent for `code`
  //TODO: move to method
  var last = code.slice(code.lastIndexOf('\n'));
  var AnyChar = /\S/g;
  var y = range[1];
  var match = AnyChar.exec(last);
  while (!match && y < this.loc()) {
    var after = this.getLineText(++y);
    AnyChar.lastIndex = 0;
    match = AnyChar.exec(after);
  }
  var indent = 0;
  if (match) indent = match.index;
  var indentText = '\n' + new Array(indent + 1).join(this.syntax.tab);

  var segment = this.segments.get(range[0]);
  if (segment) {
    code = SEGMENT[segment] + '\uffba\n' + code + indentText + '\uffbe*/`'
    code = this.syntax.highlight(code);
    code = '<' + segment[0] + '>' +
      code.substring(
        code.indexOf('\uffba') + 2,
        code.lastIndexOf('\uffbe')
      );
  } else {
    code = this.syntax.highlight(code + indentText + '\uffbe*/`');
    code = code.substring(0, code.lastIndexOf('\uffbe'));
  }
  return code;
};

Buffer.prototype.getLine = function(y) {
  var line = new Line;
  var loc = this.loc()
  line.offsetRange = this.getLineRangeOffsets([y,y]);
  line.offset = line.offsetRange[0];
  line.length = line.offsetRange[1] - line.offsetRange[0] - (y < loc ? 1 : 0);
  line.point.set({ x: 0, y:y >= loc ? loc : y });
  return line;
};

Buffer.prototype.getPoint = function(p) {
  var line = this.getLine(p.y);
  var point = new Point({
    x: Math.min(line.length, p.x),
    y: line.point.y
  });
  point.offset = line.offset + point.x;
  point.point = point;
  point.line = line;
  return point;
};

Buffer.prototype.getLineRangeText = function(range) {
  var offsets = this.getLineRangeOffsets(range);
  var text = this.text.getRange(offsets);
  return text;
};

Buffer.prototype.getLineRangeOffsets = function(range) {
  var a = this.getLineOffset(range[0]);
  var b = range[1] >= this.loc()
    ? this.text.length
    : this.getLineOffset(range[1] + 1);
  var offsets = [a, b];
  return offsets;
};

Buffer.prototype.getOffsetRangeText = function(offsetRange) {
  var text = this.text.getRange(offsetRange);
  return text;
};

Buffer.prototype.getOffsetPoint = function(offset) {
  var token = this.tokens.getByOffset('lines', offset - .5);
  return new Point({
    x: offset - (offset > token.offset ? token.offset + (!!token.part.length) : 0),
    y: Math.min(this.loc(), token.index - (token.offset + 1 > offset) + 1)
  });
};

Buffer.prototype.charAt = function(offset) {
  var char = this.text.getRange([offset, offset + 1]);
  return char;
};

Buffer.prototype.getOffsetLineText = function(offset) {
  return {
    line: line,
    text: text,
  }
};

Buffer.prototype.getLineLength = function(line) {
  return this.getLine(line).length
}

Buffer.prototype.getLineText = function(y) {
  var text = this.getLineRangeText([y,y]);
  return text;
};

Buffer.prototype.getAreaText = function(area) {
  var offsets = this.getAreaOffsetRange(area);
  var text = this.text.getRange(offsets);
  return text;
};

Buffer.prototype.wordAreaAtPoint = function(p, inclusive) {
  var point = this.getPoint(p);
  var text = this.text.getRange(point.line.offsetRange);
  var words = Regexp.parse(text, WORDS);

  if (words.length === 1) {
    var area = new Area({
      begin: { x: 0, y: point.y },
      end: { x: point.line.length, y: point.y },
    });

    return area;
  }

  var lastIndex = 0;
  var word = [];
  var end = text.length;

  for (var i = 0; i < words.length; i++) {
    word = words[i];
    if (word.index > point.x - !!inclusive) {
      end = word.index;
      break;
    }
    lastIndex = word.index;
  }

  var area = new Area({
    begin: { x: lastIndex, y: point.y },
    end: { x: end, y: point.y }
  });

  return area;
};

Buffer.prototype.moveAreaByLines = function(dy, area) {
  if (area.begin.y + dy < 0 || area.end.y + dy > this.loc()) return false;

  let x = 0
  let y = area.begin.y + dy

  let swap_a = false
  let swap_b = false

  area.end.x = area.begin.x = 0
  area.end.y = area.end.y + 1

  if (dy > 0 && area.end.y === this.loc()) {
    if (area.begin.y === 0) {
      area.begin.x = 0
      area.end.x = 0
      x = Infinity
      swap_b = true
    } else {
      area.end.y = this.loc()
      y = area.begin.y + dy
      x = Infinity
      swap_b = true
    }
  } else if (dy < 0 && area.end.y > this.loc() && y > 0) {
    area.begin.y = y
    area.begin.x = this.getLineLength(area.begin.y)
    y = area.begin.y - 1
    x = Infinity
  } else if (dy < 0 && y === 0 && area.end.y > this.loc()) {
    area.begin.y -= 1
    area.begin.x = this.getLineLength(area.begin.y)
    swap_a = true
  }

  let offsets = this.getAreaOffsetRange(area)
  let text = this.text.getRange(offsets)

  if (swap_a) {
    text = text.slice(1) + text[0]
  }
  if (swap_b) {
    text = text.slice(-1) + text.slice(0, -1)
  }

  this.remove(offsets)
  this.insert({ x, y }, text);

  return true;
};

Buffer.prototype.getAreaOffsetRange = function(area) {
  var begin = this.getPoint(area.begin)
  var end = this.getPoint(area.end)
  var range = [
    Math.max(0, begin.offset),
    end.y < area.end.y ? end.line.offsetRange[1] : end.offset
  ];
  return range;
};

Buffer.prototype.getOffsetLine = function(offset) {
  return line;
};

Buffer.prototype.getLineOffset = function(y) {
  var offset = y < 0 ? -1 : y === 0 ? 0 : this.tokens.getByIndex('lines', y - 1) + 1;
  return offset;
};

Buffer.prototype.getLongestLineLength = function() {
  // TODO: this should be part of the 'Parts' class
  // so lookup becomes O(1), currently lookup is O(n)
  var max = this.getLineLength(this.loc()) + 1, diff = 0, prev = -1, curr = 0
  var parts = this.tokens.getCollection('lines').parts
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i]
    for (var j = 0; j < part.length; j++) {
      curr = part[j]
      diff = curr - prev
      prev = curr
      if (diff > max) max = diff
    }
  }
  return max - 1 // minus the newline char
}

Buffer.prototype.loc = function() {
  return this.tokens.getCollection('lines').length;
};

Buffer.prototype.toString = function() {
  return this.text.toString();
};

function Line() {
  this.offsetRange = [];
  this.offset = 0;
  this.length = 0;
  this.point = new Point;
}

function normalizeEOL(s) {
  return s.replace(EOL, '\n');
}
