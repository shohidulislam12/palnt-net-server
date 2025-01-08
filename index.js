require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId, Timestamp } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')
const nodemailer = require("nodemailer");
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
       // const verify token
const verifyAdmin=async(req,res,next)=>{
//console.log('data from verify midddle',req.user?.email)
const email=req.user?.email
const query={email}
const result=await userCollection.findOne(query)
if(!result||result?.role!=='admin'){
  return res.status(403).send({message:'forbidden access Admin only Action'})
}

next()

}
const verifySeller=async(req,res,next)=>{
//console.log('data from verify midddle',req.user?.email)
const email=req.user?.email
const query={email}
const result=await userCollection.findOne(query)
if(!result||result?.role!=='seller'){
  return res.status(403).send({message:'forbidden access Seller only Action'})
}

next()

}
//sent mail usingg nodemailer
const sentEmail=(email,emailData)=>{
  //creat a transporter
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for port 465, false for other ports
    auth: {
      user:process.env.NODEMAILER_USER,
      pass:process.env.NODEMAILERPASS,
    },
  });
  transporter.verify((error,success)=>{
    if(error){
      console.log(error)
    }
    else{
      console.log('transport is ready')
    }
  });
  const mailBody={
    from: process.env.NODEMAILER_USER, // sender address
    to:email, // list of receivers
    subject:emailData?.subject, // Subject line
    //text: email?.message, // plain text body
    html: `<p>${emailData?.message}</p>`, // html body
  }
  //sent mail
  transporter.sendMail(mailBody,(err,inf)=>{
    if(err){
      console.log(err)
    }
    else{
      console.log("email-sent: "+ inf?.response)
    }
  })
  
}



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
app.post('/plants',verifyToken,verifySeller, async(req,res)=>{
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
  if(result?.insertedId){
    //sent mail customer
   sentEmail(orderInf?.customer?.email,{
    subject:'order sucessfully',
    message:` You've placed an order sucessfully. Transition Id:${result?.insertedId}`
   })
    //sent mail seller
   sentEmail(orderInf?.seller,{
    subject:'order booking ',
    message:` You've placed an order to process. Order From:${orderInf?.customer?.email}`
   })
  }
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
// get all user data
app.get('/all-user/:email',verifyToken, verifyAdmin, async(req,res)=>{
  const email=req.params.email
  const query={email:{$ne:email}}
 const result=await userCollection.find(query).toArray()
 res.send(result)
})
// update user rule and status
app.patch('/user/role/:email',verifyToken,async(req,res)=>{
   const email=req.params.email
   const {role}=req.body
   const filter={email}
   const updateDoc={
    $set:{role,status:'Verified'}
   }
   const result=await userCollection.updateOne(filter,updateDoc)
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

// seller plan 
app.get('/plants/seller/:email',verifyToken,verifySeller,async(req,res)=>{
  const email=req.params?.email
  const query={'sellerInf.email':email}
  const result=await plantsCollection.find(query).toArray()
  res.send(result)

})
//delete
app.delete('/plants/:id',async(req,res)=>{
  const id=req.params.id
  const query={_id:new ObjectId(id)}
  const result=await plantsCollection.deleteOne(query)
  res.send(result)
})


// get order for selelr 
app.get('/sellerorder/:email',verifyToken,verifySeller,async(req,res)=>{
  const email=req.params.email
  const query={seller:email}
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
       

      }
    },
    {
      $project:{plants:0}
    }
  ]).toArray()
  res.send(result)

  
})
 // update status order from seller
 app.patch('/order/status/:id',verifyToken,verifySeller,async(req,res)=>{
  const id=req.params.id
  const {status}=req.body
  const filter={_id:new ObjectId(id)}
  const updateDoc={
   $set:{status}
  }
  const result=await ordersCollection.updateOne(filter,updateDoc)
  res.send(result)
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
