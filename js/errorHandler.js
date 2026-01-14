// Install math.js via CDN in index.html first
// Add to <head>: <script src="https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.0/math.min.js"></script>

calculateBtn.addEventListener('click', () => {
    if (!selectedPlayerStats) {
        alert('Please select a player first!');
        return;
    }
    
    const formula = document.getElementById('statFormula').value;
    
    try {
        let evalFormula = formula;
        
        // Replace stat names with values
        Object.entries(selectedPlayerStats).forEach(([key, value]) => {
            if (typeof value === 'number') {
                const regex = new RegExp(key, 'gi');
                evalFormula = evalFormula.replace(regex, value);
            }
        });
        
        // Use math.js instead of eval() - SECURE
        const result = math.evaluate(evalFormula);
        document.getElementById('resultValue').textContent = result.toFixed(2);
        document.getElementById('resultPlayerName').textContent = `for ${selectedPlayerName}`;
        statResult.style.display = 'block';
    } catch (error) {
        alert('Invalid formula! Please check your syntax.');
        console.error('Formula error:', error);
    }
});