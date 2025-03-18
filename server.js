const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const archiver = require('archiver');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/assignmentDB';

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Basic Multer storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware to log request body
app.use((req, res, next) => {
    console.log('Request body before route:', req.body);
    next();
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB!'))
  .catch(err => console.error('MongoDB connection error:', err.message));

// Schemas
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    studentID: { type: String, required: function() { return this.role === 'student'; } },
    role: { type: String, enum: ['student', 'teacher'], required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: function() { return this.role === 'student'; } },
});
const User = mongoose.model('User', userSchema);

const classSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, unique: true, required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});
const Class = mongoose.model('Class', classSchema);

const assignmentSchema = new mongoose.Schema({
    topic: { type: String, required: true },
    deadline: { type: Date, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});
const Assignment = mongoose.model('Assignment', assignmentSchema);

const submissionSchema = new mongoose.Schema({
    studentID: String,
    username: String,
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    filePath: String,
    date: { type: Date, default: Date.now },
});
const Submission = mongoose.model('Submission', submissionSchema);

// Routes



app.get('/test', (req, res) => {
    console.log('Test route hit');
    res.send('Server is up!');
  });
app.post('/api/signup', async (req, res) => {
    const { username, password, studentID, role, classId } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: 'Username already taken' });

        if (role === 'student' && (!studentID || !classId)) {
            return res.status(400).json({ message: 'Student ID and Class are required for students' });
        }
        if (role === 'teacher' && (studentID || classId)) {
            return res.status(400).json({ message: 'Teachers should not provide Student ID or Class' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            username,
            password: hashedPassword,
            studentID: role === 'student' ? studentID : undefined,
            role,
            classId: role === 'student' ? classId : undefined,
        });
        await user.save();
        res.status(201).json({ message: 'Signup successful' });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password, role } = req.body;
    try {
        const user = await User.findOne({ username }).populate('classId');
        if (!user) return res.status(400).json({ message: 'User not found' });
        if (user.role !== role) return res.status(400).json({ message: `Role mismatch: User is a ${user.role}, not a ${role}` });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Incorrect password' });

        res.json({ username: user.username, studentID: user.studentID, role: user.role, classId: user.classId });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.post('/api/classes', async (req, res) => {
    const { name, code, createdBy } = req.body;
    try {
        if (!code) return res.status(400).json({ message: 'Course code is required' });
        const existingClass = await Class.findOne({ code });
        if (existingClass) return res.status(400).json({ message: 'Course code already in use' });

        const classObj = new Class({ name, code, createdBy });
        await classObj.save();
        res.status(201).json({ message: 'Class created', class: classObj });
    } catch (error) {
        console.error('Class creation error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.get('/api/classes', async (req, res) => {
    try {
        const classes = await Class.find();
        res.json(classes);
    } catch (error) {
        console.error('Get classes error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.get('/api/classes/teacher/:username', async (req, res) => {
    try {
        const classes = await Class.find({ createdBy: req.params.username });
        res.json(classes);
    } catch (error) {
        console.error('Get teacher classes error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.delete('/api/classes/:classId', async (req, res) => {
    try {
        const { classId } = req.params;
        const { createdBy } = req.body;

        if (!mongoose.Types.ObjectId.isValid(classId)) {
            return res.status(400).json({ message: 'Invalid classId' });
        }
        if (!createdBy) {
            return res.status(400).json({ message: 'createdBy is required' });
        }

        const classObj = await Class.findOne({ _id: classId, createdBy });
        if (!classObj) {
            return res.status(404).json({ message: 'Class not found or not owned by you' });
        }

        await Assignment.deleteMany({ classId });
        await Submission.deleteMany({ assignmentId: { $in: await Assignment.find({ classId }).select('_id') } });
        await Class.deleteOne({ _id: classId });

        res.json({ message: 'Class and associated data deleted' });
    } catch (error) {
        console.error('Delete class error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.get('/api/students/:classId', async (req, res) => {
    try {
        const { classId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(classId)) {
            return res.status(400).json({ message: 'Invalid classId' });
        }
        const students = await User.find({ classId, role: 'student' });
        res.json(students);
    } catch (error) {
        console.error('Get students error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.post('/api/assignments', async (req, res) => {
    const { topic, deadline, classId, createdBy } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(classId)) {
            return res.status(400).json({ message: 'Invalid classId' });
        }
        const assignment = new Assignment({ topic: topic.trim(), deadline, classId, createdBy });
        await assignment.save();
        res.status(201).json({ message: 'Assignment created', assignment });
    } catch (error) {
        console.error('Assignment creation error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.get('/api/assignments', async (req, res) => {
    const { classId } = req.query;
    try {
        if (classId && !mongoose.Types.ObjectId.isValid(classId)) {
            return res.status(200).json([]);
        }
        const filter = classId ? { classId } : {};
        const assignments = await Assignment.find(filter).populate('classId');
        res.json(assignments);
    } catch (error) {
        console.error('Get assignments error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.post('/api/submit', upload.single('assignmentFile'), async (req, res) => {
    console.log('Incoming request body:', req.body);
    console.log('Incoming file (before upload):', req.file);

    const { studentID, username, assignmentId, classId } = req.body;

    // Validate required fields
    if (!studentID || !username || !assignmentId || !classId) {
        return res.status(400).json({ message: 'Missing required fields: studentID, username, assignmentId, or classId' });
    }
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
        return res.status(400).json({ message: 'Invalid assignmentId' });
    }
    if (!mongoose.Types.ObjectId.isValid(classId)) {
        return res.status(400).json({ message: 'Invalid classId' });
    }

    // Check deadline
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    if (new Date() > new Date(assignment.deadline)) {
        return res.status(400).json({ message: 'Deadline has passed; submission not allowed' });
    }

    // Fetch class and assignment details
    const classObj = await Class.findById(classId);
    const classFolder = classObj ? `${classObj.name}(${classObj.code})` : 'unknown';
    const assignmentFolder = assignment.topic || 'unknown';

    // Sanitize and trim folder names
    const sanitize = (str) => str.trim().replace(/[^a-zA-Z0-9-_() ]/g, '_');
    const folder = `assignments/${sanitize(classFolder)}/${sanitize(assignmentFolder)}`;
    const publicId = `${folder}/${studentID}`;

    // Check file presence
    if (!req.file || !req.file.buffer) {
        console.error('No file buffer found:', req.file);
        return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload to Cloudinary with Promise
    try {
        const uploadPromise = new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: folder,
                    public_id: studentID,
                    resource_type: 'raw',
                    format: 'pdf',
                    transformation: [{ quality: 40, fetch_format: 'pdf' }],
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(req.file.buffer);
        });

        const uploadResult = await uploadPromise;
        console.log('Cloudinary upload result:', uploadResult);

        // Generate signed URL
        const filePath = cloudinary.url(`${folder}/${studentID}.pdf`, {
            resource_type: 'raw',
            sign_url: true,
            secure: true,
            expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24-hour expiration
        });
        if (!filePath) {
            throw new Error('Failed to generate signed URL');
        }
        console.log('Signed file path:', filePath);

        // Save submission
        let submission = await Submission.findOne({ studentID, assignmentId });
        if (submission) {
            submission.filePath = filePath;
            submission.date = new Date();
            await submission.save();
            console.log('Updated submission:', submission);
            res.json({ message: 'Submission updated' });
        } else {
            submission = new Submission({ studentID, username, assignmentId, filePath });
            await submission.save();
            console.log('New submission:', submission);
            res.json({ message: 'Assignment submitted' });
        }
    } catch (error) {
        console.error('Submission error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
}, (err, req, res, next) => {
    console.error('Multer error:', err);
    res.status(500).json({ message: 'File upload error', details: err.message });
});

app.get('/api/submissions/student/:username', async (req, res) => {
    try {
        const submissions = await Submission.find({ username: req.params.username }).populate('assignmentId');
        console.log('Submissions for student:', submissions);
        res.json(submissions);
    } catch (error) {
        console.error('Get student submissions error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.get('/api/submissions/assignment/:assignmentId', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.assignmentId)) {
            return res.status(400).json({ message: 'Invalid assignmentId' });
        }
        const submissions = await Submission.find({ assignmentId: req.params.assignmentId }).populate('assignmentId');
        console.log('Submissions for assignment:', submissions);
        res.json(submissions);
    } catch (error) {
        console.error('Get assignment submissions error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.get('/api/download-submissions/:assignmentId', async (req, res) => {
    try {
        const { assignmentId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
            return res.status(400).json({ message: 'Invalid assignmentId' });
        }

        const submissions = await Submission.find({ assignmentId }).populate('assignmentId');
        console.log('Submissions for download:', submissions);
        if (submissions.length === 0) {
            return res.status(404).json({ message: 'No submissions found for this assignment' });
        }

        const archive = archiver('zip', { zlib: { level: 9 } });
        res.attachment(`submissions-${assignmentId}.zip`);
        archive.pipe(res);

        for (const sub of submissions) {
            const fileUrl = sub.filePath;
            if (!fileUrl) {
                console.warn(`Skipping submission for ${sub.username} (ID: ${sub.studentID}) - filePath is undefined`);
                continue;
            }
            console.log(`Downloading file: ${fileUrl}`);
            const fileName = `${sub.studentID}.pdf`;
            try {
                const response = await axios.get(fileUrl, { responseType: 'stream' });
                archive.append(response.data, { name: fileName });
            } catch (downloadError) {
                console.error(`Failed to download ${fileUrl}:`, downloadError.message);
            }
        }

        archive.finalize();
    } catch (error) {
        console.error('Download submissions error:', error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});