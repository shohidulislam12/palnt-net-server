require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId, Timestamp } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')

const port = process.env.PORT || 9000
const app = express()
// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))
console.log(process.env.DB_USER)
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.mq5kn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {
        // Send a ping to confirm a successful connection
        await client.db('admin').command({ ping: 1 })
        console.log(
          'Pinged your deployment. You successfully connected to MongoDB!'
        )
        const db=client.db('plantNetLive')
        const userCollection=db.collection('users')
        const plantsCollection=db.collection('plants')
        const ordersCollection=db.collection('orders')
       // const 
    // Generate jwt token
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
      } catch (err) {
        res.status(500).send(err)
      }
    })
//save/update userinf
app.post('/users/:email',async(req,res)=>{
  const email=req.params.email
      const user=req.body
      //find user database
      const query={email}
      const isExist=await userCollection.findOne(query)
      if(isExist){
        return res.send(isExist)
      }
      const result=await userCollection.insertOne({...user,
        role:"customer",
        timestamp:Date.now()})
      res.send(result)

})
// add plants
app.post('/plants',verifyToken, async(req,res)=>{
  const plants=req.body
  const result=await plantsCollection.insertOne(plants)
  res.send(result)
})
app.get('/plants', async(req,res)=>{

  const result=await plantsCollection.find().toArray()
  res.send(result)
})
app.get('/plants/:id', async(req,res)=>{
const id=req.params.id
const  query={_id:new ObjectId(id)}

  const result=await plantsCollection.findOne(query)
  res.send(result)
})

//save order 

app.post('/orders',verifyToken, async(req,res)=>{
  const orderInf=req.body
  const result=await ordersCollection.insertOne(orderInf)
  res.send(result)
})

// manage plant quantity
app.patch('/plants/quantity/:id',verifyToken,async(req,res)=>{
  const id=req.params.id
  const query={_id:new ObjectId(id)}
  const {quantityUpdate,status}=req.body

  let updateDoc = {};

  if (status === 'decrease') {
    updateDoc = {
      $inc: { quantity: -quantityUpdate },
    };
  } else if (status === 'increase') {
    updateDoc = {
      $inc: { quantity: quantityUpdate },
    };
  }
  const result = await plantsCollection.updateOne(query,updateDoc)
  res.send(result)
})

// get order by email 
app.get('/customerorder/:email',verifyToken,async(req,res)=>{
  const email=req.params.email
  const query={'customer.email':email}
  //const result=await ordersCollection.find(query).toArray()
  const result=await ordersCollection.aggregate([
    {
      $match:query,
    },{
      $addFields:{
        plantId: {$toObjectId:'$plantId'}
      }
    },{
      $lookup:{
        from:'plants',
        localField:'plantId',
        foreignField:'_id',
        as:'plants'

      }
    },
    {
      $unwind:'$plants'
    },
    {
      $addFields:{
        name:'$plants.name',
        plantphoto:'$plants.plantphoto',
        category:'$plants.category',

      }
    },
    {
      $project:{plants:0}
    }
  ]).toArray()
  res.send(result)

  
})

// cancel orders
app.delete('/order/:id',verifyToken,async(req,res)=>{
  const id=req.params.id
  const query={_id:new ObjectId(id)}
  const order= await ordersCollection.findOne(query)
  if(order.status==='Delivered'){
    return res.status(409).send("cannor deal cancel once product is deleverd")
  }
  const result= await ordersCollection.deleteOne(query)
  res.send(result)
})

//manage user status and rule
app.patch('/user/:email',verifyToken,async(req,res)=>{
     const email=req.params.email
     const query={email}
     const user=await userCollection.findOne(query)
     if(!user|| user?.status==='requested')
      return res.status(400).send('you have already requasted wait for some times')

   const updateDoc={
    $set:{
      status:'requested',
    }
   }
   const result=await userCollection.updateOne(query,updateDoc)
   res.send(result)
})
// get    user role
app.get('/user/role/:email',async (req,res)=>{
       const email=req.params.email
       const result=await userCollection.findOne({email})
       res.send({role:result?.role})
})


 


  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from plantNet Server..')
})

app.listen(port, () => {
  console.log(`plantNet is running on port ${port}`)
})
