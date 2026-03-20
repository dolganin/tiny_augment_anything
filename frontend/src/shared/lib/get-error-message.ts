import axios from 'axios'

export const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message

    if (typeof message === 'string' && message.length > 0) {
      return message
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
