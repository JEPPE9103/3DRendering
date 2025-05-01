import React, { useState } from 'react';
import ThreeScene from './components/ThreeScene';
import './App.css';

function App() {
  const [showTester, setShowTester] = useState(false);

  return (
    <div className="App">
      <ThreeScene />
    </div>
  );
}

export default App;
