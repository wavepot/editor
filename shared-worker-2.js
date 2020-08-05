onconnect = function (e) {
  const port = e.ports[0]

  // const worker = new SharedWorker('/shared-worker.js')

  port.onmessage = e => {
    //
  }
  port.postMessage('yes')

  // worker.port.start()
  // worker.port.onmessage = e => {
  //   port.postMessage('received', e.data)
  // }

  // worker.port.postMessage('hellooo')
}
// worker
// worker.onmessage = e => {
  // worker.port.postMessage('received', e.data)
// }
