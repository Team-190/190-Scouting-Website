import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <h1>Hello Vite + React!</h1>
      <button onClick={() => setCount((count) => count + 1)}>
        count is: {count}
      </button>
      <p>
        Edit <code>src/App.jsx</code> and save to test HMR updates.
      </p>
    </div>
  )
}

export default App