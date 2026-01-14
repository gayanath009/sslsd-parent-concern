import { useNavigate } from 'react-router-dom';
import './Home.css';
import sslsdLogo from '../assets/sslsd-logo.png';

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
                <div className="text-center mb-3">
                  <img src={sslsdLogo} alt="SSLSD Logo" style={{ width: '200px', height: 'auto' }} />
                </div>
                <h1 className="card-title text-center mb-4">Welcome to SSLSD Parent Concerns Portal</h1>
                <p className="card-text text-center mb-4">
                  Raise parent concerns here.
                  <br />
                  Sign in to get started and manage your submissions
                  or post it annomynously.
                </p>
                <div className="text-center">
                  {/* <button className="btn btn-primary btn-lg px-5" onClick={taketoSignIn}>
                    Sign In with Google
                  </button> */}
                  <div className="my-3"></div>
                  <button className="btn btn-primary btn-lg px-5" onClick={() => navigate('/login', { state: { method: 'email' } })}>
                    Sign in with Email
                  </button>
                </div>
                <div>&nbsp;</div>
                <div className="text-center">
                  <button className="btn btn-primary btn-lg px-5" onClick={handleAnonymousClick}>
                    Submit Anonymously
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>

      </div>
    </div >
  );
}

export default Home;
