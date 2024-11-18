import express from 'express';
import Instructor from '../model/Instructor.js'; 
import authenticateToken from '../middleware/authenticateToken.js';
import Research from '../model/Research.js';
import Student from '../model/Student.js';
import AdviserRequest from '../model/AdviserRequest.js';

const instructorRoutes = express.Router();

// Get profile route
instructorRoutes.get('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId; 
        const user = await Instructor.findById(userId).select('name email role');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json(user);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update profile route
instructorRoutes.put('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        const { name, email, role } = req.body;

        if (!name || !email) {
            return res.status(400).json({ message: 'Name and Email are required fields' });
        }

        const updatedUser = await Instructor.findByIdAndUpdate(
            userId,
            { name, email, role },
            { new: true, runValidators: true } 
        );

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json(updatedUser); 
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all submissions from managed students only
instructorRoutes.get('/submissions', authenticateToken, async (req, res) => {
    try {
        console.log('Fetching submissions...');
        const instructorId = req.user.userId;

        // First, get all students managed by this specific instructor
        const managedStudents = await Student.find({ 
            managedBy: instructorId,  // Only get students managed by this instructor
            archived: false
        });

        // Get the student IDs managed by this instructor
        const managedStudentIds = managedStudents.map(student => student.studentId);
        console.log('Managed student IDs:', managedStudentIds);

        // Only get submissions from these managed students
        const submissions = await Research.find({
            studentId: { $in: managedStudentIds }
        }).populate({
            path: 'mongoId',
            model: 'Student',
            select: 'name email studentId section'
        }).sort({ createdAt: -1 });
            
        const transformedSubmissions = submissions.map(submission => ({
            _id: submission._id,
            title: submission.title,
            authors: submission.authors,
            abstract: submission.abstract,
            keywords: submission.keywords,
            status: submission.status,
            uploadDate: submission.uploadDate,
            driveFileId: submission.driveFileId,
            studentName: submission.mongoId?.name || 'Unknown',
            studentEmail: submission.mongoId?.email || 'Unknown',
            studentId: submission.studentId,
            section: submission.mongoId?.section || 'Unknown'
        }));

        console.log('Found submissions for instructor:', transformedSubmissions);
        
        res.json(transformedSubmissions);
    } catch (error) {
        console.error('Error in /submissions route:', error);
        res.status(500).json({ 
            message: 'Error fetching submissions',
            error: error.message 
        });
    }
});

// Update submission status
instructorRoutes.put('/submissions/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const submission = await Research.findById(id);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }
    submission.status = status;
    if (note) submission.note = note;
    await submission.save();
    res.json({ message: 'Status updated successfully', submission });
  } catch (error) {
    console.error('Error updating submission status:', error);
    res.status(500).json({ message: 'Error updating submission status' });
  }
});

// Get students managed by this instructor only
instructorRoutes.get('/students', authenticateToken, async (req, res) => {
    try {
        const instructorId = req.user.userId;
        
        const students = await Student.find({ 
            managedBy: instructorId,  // Only get students managed by this instructor
            archived: false
        });
        
        res.status(200).json(students);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add student to instructor's managed list
instructorRoutes.post('/students/add', authenticateToken, async (req, res) => {
    try {
        const { studentId, section } = req.body;
        const instructorId = req.user.userId;

        // Check if student exists and isn't already managed by another instructor
        const existingStudent = await Student.findOne({ 
            studentId,
            managedBy: { $exists: false }  // Only allow adding students not managed by any instructor
        });

        if (!existingStudent) {
            return res.status(404).json({ 
                message: 'Student ID not found or student already assigned to an instructor'
            });
        }

        // Update student with section and instructor
        existingStudent.section = section;
        existingStudent.managedBy = instructorId;
        await existingStudent.save();

        res.status(200).json(existingStudent);
    } catch (error) {
        console.error('Error adding student:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// When deleting a student, remove instructor management
instructorRoutes.delete('/students/:studentId', authenticateToken, async (req, res) => {
    try {
        const { studentId } = req.params;
        const instructorId = req.user.userId;

        // Only allow removing students managed by this instructor
        const student = await Student.findOne({
            studentId,
            managedBy: instructorId
        });

        if (!student) {
            return res.status(404).json({ message: 'Student not found or not managed by you' });
        }

        // Remove instructor management and section
        student.managedBy = undefined;
        student.section = undefined;
        await student.save();

        res.status(200).json({ message: 'Student removed successfully' });
    } catch (error) {
        console.error('Error removing student:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get detailed student information
instructorRoutes.get('/students/:studentId/details', authenticateToken, async (req, res) => {
    try {
        const { studentId } = req.params;
        
        // Get student basic info
        const student = await Student.findOne({ studentId });
        
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        // Combine all information
        const studentDetails = {
            ...student.toObject()
        };

        res.status(200).json(studentDetails);
    } catch (error) {
        console.error('Error fetching student details:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get available research projects (those without advisers)
instructorRoutes.get('/available-research', authenticateToken, async (req, res) => {
    try {
        const availableResearch = await Research.find({
            adviser: null  // Change this line from { $exists: false } to null
        }).select('title _id studentId');

        console.log('Available research:', availableResearch); // Add this debug log
        res.status(200).json(availableResearch);
    } catch (error) {
        console.error('Error fetching available research:', error);
        res.status(500).json({ message: 'Error fetching research projects' });
    }
});

// Submit adviser request
instructorRoutes.post('/adviser-request', authenticateToken, async (req, res) => {
    try {
        const { researchId, message } = req.body;
        const instructorId = req.user.userId;

        // Get instructor details
        const instructor = await Instructor.findById(instructorId);
        if (!instructor) {
            return res.status(404).json({ 
                message: 'Instructor not found' 
            });
        }

        // Check if research exists and has no adviser
        const research = await Research.findOne({
            _id: researchId,
            adviser: null  // Changed from { $exists: false } to null
        });

        console.log('Found research:', research); // Debug log

        if (!research) {
            return res.status(400).json({ 
                message: 'Research not found or already has an adviser' 
            });
        }

        // Check if instructor already has a pending request for this research
        const existingRequest = await AdviserRequest.findOne({
            research: researchId,
            instructor: instructorId,
            status: 'pending'
        });

        if (existingRequest) {
            return res.status(400).json({ 
                message: 'You already have a pending request for this research' 
            });
        }

        // Create adviser request with instructor details and research title
        const adviserRequest = new AdviserRequest({
            research: researchId,
            researchTitle: research.title,
            instructor: instructorId,
            instructorName: instructor.name,
            instructorEmail: instructor.email,
            message: message,
            status: 'pending'
        });

        await adviserRequest.save();

        res.status(201).json({ 
            message: 'Adviser request submitted successfully' 
        });

    } catch (error) {
        console.error('Error submitting adviser request:', error);
        res.status(500).json({ 
            message: 'Error submitting request' 
        });
    }
});

// Update the GET route to include researchTitle
instructorRoutes.get('/adviser-requests', authenticateToken, async (req, res) => {
    try {
        const instructorId = req.user.userId;
        
        const requests = await AdviserRequest.find({ instructor: instructorId })
            .populate('research', 'title')
            .select('research researchTitle instructorName instructorEmail message status createdAt')
            .sort({ createdAt: -1 });
            
        res.status(200).json(requests);
    } catch (error) {
        console.error('Error fetching adviser requests:', error);
        res.status(500).json({ message: 'Error fetching requests' });
    }
});

export default instructorRoutes;
