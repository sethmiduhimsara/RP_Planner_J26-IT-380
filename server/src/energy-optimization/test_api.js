fetch('http://localhost:5000/api/energy-optimization/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        ambientTemp: 32.5, 
        humidity: 75.0, 
        currentPoolTemp: 33.0 
    })
})
.then(res => res.json())
.then(data => console.log("🔥 API Output:", data))
.catch(err => console.error("Error:", err));