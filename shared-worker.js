let i = 0

onconnect = function(e) {
  var port = e.ports[0]

  port.onmessage = e => {
    port.postMessage('hello ' + (++i));
  }

  // port.postMessage('hello ' + (++i));
}
