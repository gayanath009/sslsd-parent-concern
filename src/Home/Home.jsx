import { useNavigate } from 'react-router-dom';
import './Home.css';

function Home() {
  const navigate = useNavigate();

  const handleAnonymousClick = () => {
    navigate('/complaints', { state: { isAnonymous: true } });
  };

  const taketoSignIn = () => { navigate('/login'); };

  return (
    <div className="home-container">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-10 col-lg-8">
            <div className="card shadow-lg">
              <div className="card-body p-4 p-md-5">
                <h1 className="card-title text-center mb-4">Welcome to Parent Concerns Portal</h1>
                <p className="card-text text-center mb-4">
                  Raise parent concerns here.
                  <br />
                  Sign in to get started and manage your submissions
                  or post it annomynously.
                </p>
                <div className="text-center">
                  <button className="btn btn-primary btn-lg px-5" onClick={taketoSignIn}>
                    Sign In with Google
                  </button>
                  &nbsp;&nbsp;


                  <button className="btn btn-primary btn-lg px-5" onClick={handleAnonymousClick}>
                    Submit Anonymously
                  </button>
                </div>



              </div>
            </div>
          </div>
        </div>

        {/* Additional responsive cards */}
        {/* <div className="row mt-5 g-4">
          <div className="col-12 col-sm-6 col-lg-6">
            <div className="card h-100 feature-card">
              <div className="card-body">
                <h5 className="card-title">📝 Easy Submission</h5>
                <p className="card-text">Raise your complaints quickly and efficiently with our user-friendly interface.</p>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-lg-6">
            <div className="card h-100 feature-card">
              <div className="card-body">
                <h5 className="card-title">🔍 Track Status</h5>
                <p className="card-text">Monitor the progress of your complaints in real-time with our tracking system.</p>
              </div>
            </div>
          </div>
        </div> */}

      </div>
    </div >
  );
}

export default Home;
