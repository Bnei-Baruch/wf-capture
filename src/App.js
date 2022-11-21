import React, { Component, Fragment } from 'react';
import 'semantic-ui-css/semantic.min.css';
import Ingest from "./components/Ingest";
import IngestTest from "./components/IngestTest";


class App extends Component {

  render() {
    return (
        <Fragment>
            {/*<Ingest capture={window.location.pathname.split('/')[1]} />*/}
            <IngestTest capture="testcap" />
        </Fragment>
    );
  }
}

export default App;
