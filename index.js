const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();
const cors = require("cors");
const stripe = require("stripe")(process.env.Stripe_pass);
const admin = require("firebase-admin");

const serviceAccount = require("./etuitionbd-7b3ea-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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
    const tutorApplyCollection = db.collection("tutorApply");
    const paymentCollection = db.collection("payment");
    // must be used after verifyFBToken middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await userCollection.findOne(query);

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };
    //  verifyTutor
    const verifyTutor = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await userCollection.findOne(query);

      if (!user || user.role !== "tutor") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    // role base data
    app.get("/users/tutors", async (req, res) => {
      const tutors = await userCollection.find({ role: "tutor" }).toArray();
      res.send(tutors);
    });

    //  role base data get
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    // get data for user
    app.get("/users/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;

      const result = await userCollection.findOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    // Delete a user by ID
    app.delete("/users/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send({
        message: "User deleted successfully",
        deletedCount: result.deletedCount,
      });
    });

    // users related apis
    app.get("/all-users", verifyFBToken, async (req, res) => {
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
    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await userCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    app.get("/users", async (req, res) => {
      const query = {};
      const { email } = req.query;
      if (email) {
        query.email = email;
      }
      const user = await userCollection.findOne({ email });
      res.send(user);
    });

    // update role
    app.patch(
      "/users/:id",

      async (req, res) => {
        const id = req.params.id;
        const statusInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            displayName: statusInfo.displayName,
            photoURL: statusInfo.photoURL,
          },
        };
        const result = await userCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

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
    app.get("/new-tuitions", async (req, res) => {
      const query = {};
      const { email, status } = req.query;
      if (email) {
        query.studentEmail = email;
      }
      if (status) {
        query.status = status;
      }

      const options = { sort: { createdAt: -1 } };
      const cursor = tuitionCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    //  tutor data get

    app.get("/new-tuitions/status", async (req, res) => {
      const query = {};
      const { tutorEmail, status } = req.query;
      if (tutorEmail) {
        query.tutorEmail = tutorEmail;
      }
      if (status) {
        query.status = status;
      }

      const options = { sort: { createdAt: -1 } };
      const cursor = tuitionCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    // get email data

    // single tuition data get
    app.get("/new-tuitions/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tuitionCollection.findOne(query);
      res.send(result);
    });

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
      const Updates = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          studentBudget: Updates.studentBudget,
          studentLocation: Updates.studentLocation,
          studentClass: Updates.studentClass,
          studentSubjects: Updates.studentSubjects,
        },
      };

      const result = await tuitionCollection.updateOne(query, updatedDoc);

      res.send(result);
    });

    //  tutor patch data

    app.patch("/new-tuitions/status/:id", async (req, res) => {
      const id = req.params.id;
      const updateStatus = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: updateStatus.status,
        },
      };
      const result = await tuitionCollection.updateOne(query, updatedDoc);

      res.send(result);
    });

    // post tutor apply data
    app.post("/tutor-apply", async (req, res) => {
      try {
        const tutor = req.body;
        const { tutorEmail, tuitionId } = tutor;

        if (!tutorEmail || !tuitionId) {
          return res
            .status(400)
            .send({ message: "tutorEmail and tuitionId are required" });
        }

        // Corrected createdAt
        tutor.createdAt = new Date();

        // Prevent duplicate application
        const userExists = await tutorApplyCollection.findOne({
          tutorEmail,
          tuitionId,
        });
        if (userExists) {
          return res.status(400).send({ message: "Already applied" });
        }

        // Insert tutor application
        const applyResult = await tutorApplyCollection.insertOne(tutor);

        // Update tuition status
        const tuitionQuery = { _id: new ObjectId(tuitionId) };
        const tuitionUpdatedDoc = { $set: { status: "ongoing" } };
        const tuitionResult = await tuitionCollection.updateOne(
          tuitionQuery,
          tuitionUpdatedDoc
        );

        res.send({
          insertedId: applyResult.insertedId,
          tuitionResult,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });
    // tutor apply data one get
    app.get("/tutor-apply/email", async (req, res) => {
      const { tutorEmail, status, studentEmail } = req.query;

      const query = {};
      if (tutorEmail) query.tutorEmail = tutorEmail;
      if (status) query.status = status;
      if (studentEmail) query.studentEmail = studentEmail;

      const result = await tutorApplyCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/tutor-apply/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tutorApplyCollection.findOne(query);
      res.send(result);
    });
    app.patch(
      "/tutor-status-apply/:id",

      async (req, res) => {
        const id = req.params.id;
        const statusInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: statusInfo.status,
          },
        };
        const result = await tutorApplyCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    //  tutor apply data edit
    // Update tutor application
    app.patch("/tutor-apply/:id", async (req, res) => {
      const id = req.params.id;
      const { qualification, experience, expectedSalary } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          qualification,
          experience,
          expectedSalary,
          updatedAt: new Date(),
        },
      };

      const result = await tutorApplyCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // delete tutor applicatation
    app.delete("/tutor-apply/:id", async (req, res) => {
      const id = req.params.id;
      const result = await tutorApplyCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send({
        message: "tutor apply deleted successfully",
        deletedCount: result.deletedCount,
      });
    });

    // payment related apis
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Please pay for: ${paymentInfo.studentSubjects}`,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.studentEmail,
        mode: "payment",
        metadata: {
          tuitionId: paymentInfo.tuitionId,
          studentEmail: paymentInfo.studentEmail,
          studentSubjects: paymentInfo.studentSubjects,

          studentName: paymentInfo.studentName,
        },

        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      console.log("session retrieve", session);

      if (session.payment_status === "paid") {
        const id = session.metadata.tuitionId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            status: "approve",
          },
        };

        const result = await tutorApplyCollection.updateOne(query, update);

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          studentEmail: session.customer_email,
          parcelId: session.metadata.tuitionId,
          studentSubjects: session.metadata.studentSubjects,
          studentName: session.metadata.studentName,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
        };

        if (session.payment_status === "paid") {
          const resultPayment = await paymentCollection.insertOne(payment);

          res.send({
            success: true,
            modifyParcel: result,

            transactionId: session.payment_intent,
            paymentInfo: resultPayment,
          });
        }
      }

      res.send({ success: false });
    });
    //  tutor earning
    app.get("/payments", async (req, res) => {
      const email = req.query.email;
      const query = {};

      // console.log( 'headers', req.headers);

      if (email) {
        query.studentEmail = email;

        // check email address
        // if (email !== req.decoded_email) {
        //   return res.status(403).send({ message: "forbidden access" });
        // }
      }
      const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
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
