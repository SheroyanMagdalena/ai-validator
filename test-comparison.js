const { MongoClient } = require('mongodb');
require('dotenv').config();

// Sample API document for testing
const sampleApiDoc = {
  "openapi": "3.0.0",
  "info": {
    "title": "User API",
    "version": "1.0.0"
  },
  "paths": {
    "/users": {
      "get": {
        "responses": {
          "200": {
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "firstName": {
                      "type": "string"
                    },
                    "lastName": {
                      "type": "string"
                    },
                    "birthDate": {
                      "type": "string",
                      "format": "date"
                    },
                    "psn": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

async function testComparison() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB;
  
  console.log('Testing MongoDB comparison...');
  
  try {
    const client = new MongoClient(uri);
    await client.connect();
    
    const db = client.db(dbName);
    const models = await db.collection('data').find().toArray();
    
    console.log(`✅ Found ${models.length} models in database`);
    
    // Test the filtering logic
    const apiText = JSON.stringify(sampleApiDoc).toLowerCase();
    console.log('\n🔍 Testing model filtering:');
    
    models.forEach((model, i) => {
      const titleMatch = model.title && apiText.includes(model.title.toLowerCase());
      const descMatch = model.description && apiText.includes(model.description.toLowerCase());
      const wouldMatch = titleMatch || descMatch;
      
      console.log(`  Model ${i + 1}: "${model.title}"`);
      console.log(`    Title match: ${titleMatch ? '✅' : '❌'}`);
      console.log(`    Description match: ${descMatch ? '✅' : '❌'}`);
      console.log(`    Would be selected: ${wouldMatch ? '✅' : '❌'}`);
      console.log('');
    });
    
    // Simulate the improved filtering logic
    const filteredModels = models.filter(
      (m) =>
        (m.title && apiText.includes(m.title.toLowerCase())) ||
        (m.description && apiText.includes(m.description.toLowerCase())),
    );
    
    const finalModels = filteredModels.length > 0 ? filteredModels : models;
    
    console.log(`📊 Results:`);
    console.log(`  - Models that match by title/description: ${filteredModels.length}`);
    console.log(`  - Models that would be used for comparison: ${finalModels.length}`);
    console.log(`  - Using fallback (all models): ${filteredModels.length === 0 ? 'YES' : 'NO'}`);
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testComparison();