process = {
    env: { NODE_ENV: "production" },
    nextTick: (cb) => setTimeout(cb, 0),
}