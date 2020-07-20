
/**
 * @module freeverb
 * @author stagas
 * @org opendsp
 * @desc freeverb reverb effect
 * @license mit
 */

import CombFilter from '../combfilter/index.js'
import Allpass from '../allpass/index.js'

const sum = (p, n) => p + n
const waterfall = (p, n) => p + n({ input: p })

export default async (context, {
  early = [225,556,441,341],
  late = [
    [1116,1188,1277,1356],
    [1422,1491,1557,1617]
  ]
} = {}) => {
  const { sampleRate } = context
  const stretch = x => Math.floor(x * (sampleRate / 44100))
  const comb = x => CombFilter(context, x)
  const allpass = x => Allpass(context, x)

  const combs_a = await Promise.all(
    late[0].map(stretch).map(comb)
  )

  const combs_b = await Promise.all(
    late[1].map(stretch).map(comb)
  )

  const aps = await Promise.all(
    early.map(stretch).map(allpass)
  )

  let sample = 0.0
  return (t, { feedback = .5, damp = .5, wet = .5 } = {}) => {
    sample = aps.reduce(waterfall,
      combs_a.map(c => c(t, { feedback, damp })).reduce(sum, 0)
    + combs_b.map(c => c(t, { feedback, damp })).reduce(sum, 0)
    )
    return sample*wet + t.input*(1-wet)
  }
}



// function Reverb({ sampleRate }){
//   if (!(this instanceof Reverb)) return new Reverb({ sampleRate });
//   this.combs_a = [1116,1188,1277,1356].map(stretch).map(CombFilter);
//   this.combs_b = [1422,1491,1557,1617].map(stretch).map(CombFilter);
//   this.aps = [225,556,441,341].map(stretch).map(Allpass);
//   this.room(0.5);
//   this.damp(0.5);
// }

// Reverb.prototype.room = function(n){
//   n = n * 0.28 + 0.7;
//   this.combs_a.forEach(setProperty('feedback', n));
//   this.combs_b.forEach(setProperty('feedback', n));
//   return this;
// };

// Reverb.prototype.damp = function(n){
//   n *= 0.4;
//   this.combs_a.forEach(setProperty('damp', n));
//   this.combs_b.forEach(setProperty('damp', n));
//   return this;
// };

// Reverb.prototype.run = function(input, pc = .5){
//   var output =
//     this.combs_a.map(run).reduce(sum)
//   + this.combs_b.map(run).reduce(sum)
//   ;
//   output = this.aps.reduce(waterfall, output);
//   return output * pc + input * (1-pc);
//   function run(el){ return el.run(input) }
// };

// function sum(p, n){
//   return p + n;
// }

// function waterfall(p, n){
//   return p + n.run(p);
// }

// function stretch(n){
//   return n * (sampleRate / 44100) | 0;
// }

// function setProperty(key, value){
//   return function(obj){
//     obj[key] = value;
//   };
// }
