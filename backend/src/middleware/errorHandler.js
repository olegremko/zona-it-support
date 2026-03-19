export function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  res.status(status).json({
    error: {
      message: error.message || 'Internal server error',
      details: error.details || null
    }
  });
}
