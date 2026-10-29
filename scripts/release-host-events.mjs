export default async function* (events) {
  for await (const event of events) {
    yield JSON.stringify(event, (_key, value) => value instanceof Error
      ? { name: value.name, message: value.message, code: value.code, failureType: value.failureType, stack: value.stack, cause: value.cause }
      : value) + '\n';
  }
}
