const { MongoClient } = require('mongodb');
require('dotenv').config();

async function testConnection() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB;
  
  console.log('Connecting to MongoDB...');
  console.log('URI:', uri ? uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'NOT SET');
  console.log('Database:', dbName);
  
  try {
    const client = new MongoClient(uri);
    await client.connect();
    console.log('✅ Connected successfully!');
    
    const db = client.db(dbName);
    
    // List all collections
    console.log('\n📋 Available collections:');
    const collections = await db.listCollections().toArray();
    collections.forEach(col => console.log(`  - ${col.name}`));
    
    if (collections.length === 0) {
      console.log('  (No collections found)');
    }
    
    // Check the 'data' collection specifically
    console.log('\n🔍 Checking "data" collection:');
    const dataCollection = db.collection('data');
    const count = await dataCollection.countDocuments();
    console.log(`  Document count: ${count}`);
    
    if (count > 0) {
      console.log('\n📄 Sample documents:');
      const samples = await dataCollection.find().limit(2).toArray();
      samples.forEach((doc, i) => {
        console.log(`  Document ${i + 1}:`, JSON.stringify(doc, null, 2));
      });
    }
    
    await client.close();
    console.log('\n✅ Connection test completed');
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testConnection();