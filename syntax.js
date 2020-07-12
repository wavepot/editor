import Regexp from './buffer/regexp.js'

var R = Regexp.create;

//NOTE: order matters
var syntax = Regexp.join([
  'newline',
  'operator',
  'params',
  'declare',
  'function',
  'keyword',
  'builtin',
  'symbol',
  'string',
  ['special', R(['special', 'number'], '')]
], 'g')
// console.log(syntax)
// var syntax = map({
//   't': R(['operator'], 'g', entities),
//   'm': R(['params'],   'g'),
//   'd': R(['declare'],  'g'),
//   'f': R(['function'], 'g'),
//   'k': R(['keyword'],  'g'),
//   'n': R(['builtin'],  'g'),
//   'l': R(['symbol'],   'g'),
//   's': R(['template string'], 'g'),
//   'e': R(['special','number'], 'g'),
// }, compile);

var Indent = {
  regexp: R(['indent'], 'gm'),
  replacer: (s) => s.replace(/ {1,2}|\t/g, '<x>$&</x>')
};

var AnyChar = /\S/g;

var Blocks = R(['comment','string','regexp'], 'gm');

var LongLines = /(^.{1000,})/gm;

var Tag = {
  '//': 'c',
  '/*': 'c',
  '`': 's',
  '"': 's',
  "'": 's',
  '/': 'r',
};

export default function Syntax(o) {
  o = o || {};
  this.tab = o.tab || '\t';
  this.blocks = [];
}

Syntax.prototype.entities = entities;

Syntax.prototype.highlight = function(code, offset) {
  // code = this.createIndents(code);
  // code = this.createBlocks(code);
  // code = entities(code);

  const pieces = []

  let match, piece, lastPos = 0
  while (match = syntax.exec(code)) {
    if (match.index > lastPos) pieces.push(['text', code.slice(lastPos, match.index), lastPos])
    // pieces.push(
    piece = Object.entries(match.groups).filter(([key, value]) => value !== undefined)[0]
    piece.push(match.index)
    pieces.push(piece)
    lastPos = match.index + piece[1].length
    // lastMatch = match
    // lastIndex = match.index
    // console.log(match)
    // code = code.replace(syntax[key].regexp, syntax[key].replacer);
  }

  // console.log(pieces)
  // code = this.restoreBlocks(code);
  // code = code.replace(Indent.regexp, Indent.replacer);

  return pieces;
};

Syntax.prototype.createIndents = function(code) {
  var lines = code.split(/\n/g);
  var indent = 0;
  var match;
  var line;
  var i;

  i = lines.length;

  while (i--) {
    line = lines[i];
    AnyChar.lastIndex = 0;
    match = AnyChar.exec(line);
    if (match) indent = match.index;
    else if (indent && !line.length) {
      lines[i] = new Array(indent + 1).join(this.tab);
    }
  }

  code = lines.join('\n');

  return code;
};

Syntax.prototype.restoreBlocks = function(code) {
  var block;
  var blocks = this.blocks;
  var n = 0;
  return code
    .replace(/\uffec/g, function() {
      block = blocks[n++];
      return entities(block.slice(0, 1000) + '...line too long to display');
    })
    .replace(/\uffeb/g, function() {
      block = blocks[n++];
      var tag = identify(block);
      return '<'+tag+'>'+entities(block)+'</'+tag+'>';
    });
};

Syntax.prototype.createBlocks = function(code) {
  this.blocks = [];

  code = code
    .replace(LongLines, (block) => {
      this.blocks.push(block);
      return '\uffec';
    })
    .replace(Blocks, (block) => {
      this.blocks.push(block);
      return '\uffeb';
    });

  return code;
};

function createId() {
  var alphabet = 'abcdefghijklmnopqrstuvwxyz';
  var length = alphabet.length - 1;
  var i = 6;
  var s = '';
  while (i--) {
    s += alphabet[Math.random() * length | 0];
  }
  return s;
}

function entities(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    ;
}

function compile(regexp, tag) {
  var openTag = '<' + tag + '>';
  var closeTag = '</' + tag + '>';
  return {
    name: tag,
    regexp: regexp,
    replacer: openTag + '$&' + closeTag
  };
}

function map(obj, fn) {
  var result = {};
  for (var key in obj) {
    result[key] = fn(obj[key], key);
  }
  return result;
}

function replace(pass, code) {
  for (var i = 0; i < pass.length; i++) {
    code = code.replace(pass[i][0], pass[i][1]);
  }
  return code;
}

function insert(offset, string, part) {
  return string.slice(0, offset) + part + string.slice(offset);
}

function identify(block) {
  var one = block[0];
  var two = one + block[1];
  return Tag[two] || Tag[one];
}
