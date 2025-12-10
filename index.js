const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const app = express();
const cors = require("cors");

const admin = require("firebase-admin");

const serviceAccount = require("./etuitionbd-7b3ea-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const uri = `mongodb+srv://${process.env.DbUser}:${process.env.DbPass}@cluster0.cymbxlh.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("e-tuition");
    const userCollection = db.collection("users");
    const tuitionCollection = db.collection("tuition");


    // get single user by id
app.get("/users/:id",  async (req, res) => {
  const id = req.params.id;
  const user = await userCollection.findOne({ _id: new ObjectId(id) });

  if (!user) {
    return res.status(404).send({ message: "User not found" });
  }

  res.send(user);
});

// Delete a user by ID 
app.delete("/users/:id", verifyFBToken, async (req, res) => {
  const id = req.params.id;
  const result = await userCollection.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    return res.status(404).send({ message: "User not found" });
  }

  res.send({ message: "User deleted successfully", deletedCount: result.deletedCount });
});


    // users related apis
    app.get("/users", verifyFBToken, async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};

      if (searchText) {
        // query.displayName = {$regex: searchText, $options: 'i'}

        query.$or = [
          { displayName: { $regex: searchText, $options: "i" } },
          { email: { $regex: searchText, $options: "i" } },
        ];
      }

      const cursor = userCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(5);
      const result = await cursor.toArray();
      res.send(result);
    });

    // set role 
     app.patch('/users/:id/role', verifyFBToken,  async (req, res) => {
            const id = req.params.id;
            const roleInfo = req.body;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: roleInfo.role
                }
            }
            const result = await userCollection.updateOne(query, updatedDoc)
            res.send(result);
        })

    // user data post api
    app.post("/users", async (req, res) => {
      const user = req.body;

      user.createdAt = new Date();
      const email = user.email;
      const userExists = await userCollection.findOne({ email });

      if (userExists) {
        return res.send({ message: "user exists" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //  tuitions data get api
    app.get("/new-tuitions", verifyFBToken, async (req, res) => {
      const query = {};
      const { email } = req.query;
      if (email) {
        query.studentEmail = email;
      }
      const options = { sort: { createdAt: -1 } };
      const cursor = tuitionCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    // get email data

    // post tuition
    app.post("/new-tuitions", async (req, res) => {
      const tuition = req.body;

      const result = await tuitionCollection.insertOne(tuition);
      res.send(result);
    });
    // tuition post delete
    app.delete("/new-tuitions/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await tuitionCollection.deleteOne(query);
      res.send(result);
    });
    // tuition pacth data
    app.patch("/new-tuitions/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          studentSubjects: data.studentSubjects,
          studentClass: data.studentClass,
          studentBudget: data.studentBudget,
          studentLocation: data.studentLocation,
        },
      };
      const options = {};

      const result = await tuitionCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
