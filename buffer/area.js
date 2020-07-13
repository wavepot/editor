import Point from './point.js'

export default class Area {
  static offset (b, a) {
    return {
      begin: point.offset(b.begin, a.begin),
      end: point.offset(b.end, a.end)
    }
  }

  static offsetX (x, a) {
    return {
      begin: point.offsetX(x, a.begin),
      end: point.offsetX(x, a.end)
    }
  }

  static offsetY (y, a) {
    return {
      begin: point.offsetY(y, a.begin),
      end: point.offsetY(y, a.end)
    }
  }

  static sort (a, b) {
    return a.begin.y === b.begin.y
      ? a.begin.x - b.begin.x
      : a.begin.y - b.begin.y
  }

  static toPointSort (a, b) {
    return a.begin.y <= b.y && a.end.y >= b.y
      ? a.begin.y === b.y
        ? a.begin.x - b.x
        : a.end.y === b.y
          ? a.end.x - b.x
          : 0
      : a.begin.y - b.y;
  }

  constructor (a) {
    if (a) {
      this.begin = new Point(a.begin);
      this.end = new Point(a.end);
    } else {
      this.begin = new Point;
      this.end = new Point;
    }
  }

  copy () {
    return new Area(this)
  }

  get () {
    var s = [this.begin, this.end].sort(Point.sort)
    return new Area({
      begin: new Point(s[0]),
      end: new Point(s[1])
    })
  }

  set (area) {
    this.begin.set(area.begin)
    this.end.set(area.end)
  }

  get height () {
    const { begin, end } = this.get()
    return end.y - begin.y
  }

  setLeft (bx, ex) {
    this.begin.x = bx;
    if (ex != null) this.end.x = ex;
    return this;
  }

  addRight (x) {
    this.begin.x += x;
    this.end.x += x;
    return this;
  }

  addBottom (y) {
    this.end.y += y;
    return this;
  }

  shiftByLines (y) {
    this.begin.y += y;
    this.end.y += y;
    return this
  }

  normalizeY () {
    return this.shiftByLines(-this.begin.y)
  }

  greaterThan (a) {
    return this.begin.y === a.end.y
      ? this.begin.x > a.end.x
      : this.begin.y > a.end.y;
  }

  greaterThanOrEqual (a) {
    return this.begin.y === a.begin.y
      ? this.begin.x >= a.begin.x
      : this.begin.y > a.begin.y;
  }

  lessThan (a) {
    return this.end.y === a.begin.y
      ? this.end.x < a.begin.x
      : this.end.y < a.begin.y;
  }

  lessThanOrEqual (a) {
    return this.end.y === a.end.y
      ? this.end.x <= a.end.x
      : this.end.y < a.end.y;
  }

  isEmpty () {
    return this.begin.equal(this.end)
  }

  inside (a) {
    return this['>'](a) && this['<'](a);
  }

  outside (a) {
    return this['<'](a) || this['>'](a);
  }

  insideEqual (a) {
    return this['>='](a) && this['<='](a);
  }

  outsideEqual (a) {
    return this['<='](a) || this['>='](a);
  }

  equal (a) {
    return this.begin.x === a.begin.x && this.begin.y === a.begin.y
        && this.end.x   === a.end.x   && this.end.y   === a.end.y;
  }

  beginLineEqual (a) {
    return this.begin.y === a.begin.y;
  }

  endLineEqual (a) {
    return this.end.y === a.end.y;
  }

  linesEqual (a) {
    return this['|='](a) && this['=|'](a);
  }

  sameLine (a) {
    return this.begin.y === this.end.y && this.begin.y === a.begin.y;
  }

  shortenByX (x) {
    return new Area({
      begin: {
        x: this.begin.x + x,
        y: this.begin.y
      },
      end: {
        x: this.end.x - x,
        y: this.end.y
      }
    });
  }

  widenByX (x) {
    return new Area({
      begin: {
        x: this.begin.x - x,
        y: this.begin.y
      },
      end: {
        x: this.end.x + x,
        y: this.end.y
      }
    });
  }

  toString () {
    let area = this.get()
    return '' + area.begin + '|' + area.end;
  }
}

Area.prototype['>'] = Area.prototype.greaterThan
Area.prototype['>='] = Area.prototype.greaterThanOrEqual
Area.prototype['<'] = Area.prototype.lessThan
Area.prototype['<='] = Area.prototype.lessThanOrEqual
Area.prototype['><'] = Area.prototype.inside
Area.prototype['<>'] = Area.prototype.outside
Area.prototype['>=<'] = Area.prototype.insideEqual
Area.prototype['<=>'] = Area.prototype.outsideEqual
Area.prototype['==='] = Area.prototype.equal
Area.prototype['|='] = Area.prototype.beginLineEqual
Area.prototype['=|'] = Area.prototype.endLineEqual
Area.prototype['|=|'] = Area.prototype.linesEqual
Area.prototype['=|='] = Area.prototype.sameLine
Area.prototype['-x-'] = Area.prototype.shortenByX
Area.prototype['+x+'] = Area.prototype.widenByX
