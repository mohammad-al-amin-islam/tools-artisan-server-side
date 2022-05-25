const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET)

//middleware
app.use(cors())
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_USER_PASSWORD}@cluster0.6bkls.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth) {
        return res.status(401).send({ message: 'Unauthorized' });
    }
    const token = auth.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbiden' })
        }
        else {
            req.decoded = decoded;
            next();
        }
    })
}

async function run() {
    try {
        await client.connect();
        const toolsCollection = client.db("tools_artisan").collection("tools");
        const userCollection = client.db("tools_artisan").collection("users");
        const orderCollection = client.db("tools_artisan").collection("orders");
        const paymentCollection = client.db("tools_artisan").collection("payments");
        const ratingCollection = client.db("tools_artisan").collection("ratings");

        //tools data loading
        app.get('/tools', async (req, res) => {
            const query = {};
            const cursor = toolsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.post('/tools', async (req, res) => {
            const { name, price, image, minOrder, availableQuantity, description } = req.body;
            const doc = { name: name, price: price, image: image, minOrder: minOrder, availableQuantity: availableQuantity, description: description };
            const result = await toolsCollection.insertOne(doc);
            res.send(result);
        });

        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await toolsCollection.findOne(query);
            res.send(result);
        });

        //add user info to db
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const user = req.body;
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
            res.send({ result, token });
        });

        //add orders to db
        app.post('/orders', async (req, res) => {
            const { customerName, email, address, number, quantity, toolsName, price } = req.body;
            const doc = { customerName: customerName, email: email, address: address, number: number, quantity: quantity, toolsName: toolsName, price: price };
            const result = await orderCollection.insertOne(doc);
            res.send(result);
        });

        app.get('/orders', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await orderCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.findOne(query);
            res.send(result);
        });

        //
        app.patch('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transaction,
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updateOrders = await orderCollection.updateOne(filter, updateDoc);
            res.send(updateOrders);
        });

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret,
            });

        })

        //delete item
        app.delete('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(filter);
            res.send(result);
        });


        app.post('/ratings', async (req, res) => {
            const { name, ratings, description } = req.body;
            const doc = { name: name, ratings: ratings, description: description };
            const result = await ratingCollection.insertOne(doc);
            res.send(result);
        });

        app.get('/ratings', async (req, res) => {
            const query = {};
            const cursor = ratingCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        //get all users
        app.get('/user', verifyJWT, async (req, res) => {
            const query = {}
            const result = await userCollection.find(query).toArray();
            res.send(result);
        });

        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const decodedEmail = req.decoded.email;
            const adminMaker = await userCollection.findOne({ email: decodedEmail });
            if (adminMaker.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                return res.status(403).send({ message: 'Forbidden' })
            }

        });


        app.get('/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            const query = { email: email };
            const result = await userCollection.findOne(query)
            const isAdmin = result.role === 'admin'
            res.send({ admin: isAdmin });
        });


    }
    finally {
        // await client.close();
    }
}

run().catch(console.dir)





app.get('/', (req, res) => {
    res.send('Tools Artisan server running successfully');
});

app.listen(port, () => {
    console.log('Tools Artisan server is running on the port', port);
})