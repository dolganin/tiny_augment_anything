import axios from 'axios'

export const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout')) {
      return 'Операция заняла слишком много времени. Для больших датасетов дождись завершения обработки и не закрывай страницу.'
    }

    const message = error.response?.data?.message
    const textPayload = typeof error.response?.data === 'string' ? error.response.data.trim() : null

    if (typeof message === 'string' && message.length > 0) {
      return message
    }

    if (textPayload) {
      return textPayload
    }

    if (typeof error.message === 'string' && error.message.length > 0) {
      return error.message
    }
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }

  return 'Не удалось завершить операцию. Попробуй повторить запрос ещё раз.'
}
