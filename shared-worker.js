import randomId from './lib/random-id.js'

let i = 0

onconnect = function(e) {
  var port = e.ports[0]

  port.onmessage = e => {
    port.postMessage('hello ' + (++i) + ' ' + randomId());
  }

  // port.postMessage('hello ' + (++i));
}
