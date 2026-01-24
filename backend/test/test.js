require("dotenv").config();


function test() {
    fetch(`http://localhost:${process.env.PORT}/postEventCode`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            eventCode: "2025nhalt1"
        })
    });
}

module.exports = {
    test,
}