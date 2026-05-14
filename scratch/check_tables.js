async function check() {
    try {
        const res = await fetch('http://localhost:3000/api/tables/diagnostic');
        const data = await res.json();
        console.log('--- DIAGNOSTIC ---');
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('Error:', e.message);
    }
}
check();
