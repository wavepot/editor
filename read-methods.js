export default async (filename) => {
  return await new Promise((resolve, reject) => {
    const worker = new Worker(import.meta.url, { type: 'module' })
    worker.onmessage = ({ data }) => resolve(data)
    worker.onerror = reject
    worker.postMessage(filename)
  })
}

onmessage = async ({ data: filename }) => {
  const module = await import(filename)
  const methods = Object.fromEntries(Object.entries(module)
    .map(([key, value]) => {
      return [key, {
        name: key,
        type: value.constructor.name,
        value: value.toString()
      }]
    })
    .filter(Boolean))
  postMessage(methods)
}
